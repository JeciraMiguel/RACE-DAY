using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;

namespace RaceDayApi.Server.Services;

/// <summary>Issues short-lived JWT access tokens and rotating, hashed refresh tokens.</summary>
public class TokenService
{
    /// <summary>Claim carrying <see cref="User.TokenVersion"/>.</summary>
    public const string TokenVersionClaim = "tv";

    private readonly IConfiguration _config;
    private readonly RaceDayDbContext _context;

    public TokenService(IConfiguration config, RaceDayDbContext context)
    {
        _config = config;
        _context = context;
    }

    private int AccessTokenMinutes => _config.GetValue("Jwt:AccessTokenMinutes", 15);
    private int RefreshTokenDays => _config.GetValue("Jwt:RefreshTokenDays", 14);

    public async Task<AuthResponseDto> CreateSessionAsync(User user)
    {
        // Housekeeping: drop this user's long-expired or long-revoked tokens
        var now = DateTime.UtcNow;
        var revokedCutoff = now.AddDays(-30);
        await _context.RefreshTokens
            .Where(t => t.UserId == user.UserId && (t.ExpiresAt < now || (t.RevokedAt != null && t.RevokedAt < revokedCutoff)))
            .ExecuteDeleteAsync();

        var refresh = NewRefreshToken(user.UserId, now);
        _context.RefreshTokens.Add(refresh.Entity);
        await _context.SaveChangesAsync();

        var (token, expires) = CreateAccessToken(user, now);
        return new AuthResponseDto(token, user.Email, user.Role, refresh.Plain, expires);
    }

    /// <summary>
    /// Rotates a refresh token. Presenting an already-used token is treated as theft:
    /// every refresh token of that user is revoked.
    /// </summary>
    public async Task<ServiceResult<AuthResponseDto>> RefreshAsync(string refreshToken)
    {
        var hash = Hash(refreshToken);
        var stored = await _context.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash);
        var now = DateTime.UtcNow;

        if (stored == null)
            return ServiceResult<AuthResponseDto>.Fail(401, "Invalid refresh token.");

        var user = stored.User!;

        if (stored.RevokedAt != null)
        {
            // A token that was rotated moments ago may legitimately be presented again: the page was
            // reloaded or closed after the server rotated it but before the browser stored the new one.
            // Anything else (logout, force revocation, or a late replay) is treated as theft.
            var leeway = TimeSpan.FromSeconds(_config.GetValue("Jwt:RefreshReuseLeewaySeconds", 30));
            var withinLeeway = stored.RotatedAt != null && now - stored.RotatedAt <= leeway;

            if (!withinLeeway || stored.ExpiresAt <= now || !user.IsActive)
            {
                await RevokeAllAsync(stored.UserId);
                return ServiceResult<AuthResponseDto>.Fail(401, "Invalid refresh token.");
            }
        }
        else
        {
            if (stored.ExpiresAt <= now || !user.IsActive)
                return ServiceResult<AuthResponseDto>.Fail(401, "Invalid refresh token.");

            stored.RevokedAt = now;
            stored.RotatedAt = now;
        }

        var next = NewRefreshToken(user.UserId, now);
        _context.RefreshTokens.Add(next.Entity);
        await _context.SaveChangesAsync();

        var (token, expires) = CreateAccessToken(user, now);
        return ServiceResult<AuthResponseDto>.Success(new AuthResponseDto(token, user.Email, user.Role, next.Plain, expires));
    }

    public async Task RevokeAsync(string refreshToken)
    {
        var hash = Hash(refreshToken);
        var stored = await _context.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);
        if (stored is { RevokedAt: null })
        {
            stored.RevokedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    public async Task RevokeAllAsync(int userId)
    {
        var now = DateTime.UtcNow;
        await _context.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));
    }

    private (string Plain, RefreshToken Entity) NewRefreshToken(int userId, DateTime now)
    {
        var plain = Base64UrlTextEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (plain, new RefreshToken
        {
            UserId = userId,
            TokenHash = Hash(plain),
            CreatedAt = now,
            ExpiresAt = now.AddDays(RefreshTokenDays)
        });
    }

    private (string Token, DateTime Expires) CreateAccessToken(User user, DateTime now)
    {
        var jwtKey = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = now.AddMinutes(AccessTokenMinutes);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(TokenVersionClaim, user.TokenVersion.ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
