using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Server.Services;

namespace RaceDayApi.Server.Controllers;

[Route("api/[controller]")]
public class AuthController : ApiControllerBase
{
    // Verified against when the email is unknown, so response time does not reveal which emails exist
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("timing-equalizer-password-1");

    private const string InvalidCredentials = "Invalid email or password.";

    private readonly RaceDayDbContext _context;
    private readonly TokenService _tokens;
    private readonly IConfiguration _config;

    public AuthController(RaceDayDbContext context, TokenService tokens, IConfiguration config)
    {
        _context = context;
        _tokens = tokens;
        _config = config;
    }

    private int MaxFailedAttempts => _config.GetValue("Auth:MaxFailedAttempts", 5);
    private int LockoutMinutes => _config.GetValue("Auth:LockoutMinutes", 15);

    /// <summary>Registers a new participant. Privileged roles are never assignable from the client.</summary>
    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        var email = dto.Email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Email == email))
            return Error(400, "Email is already registered.");

        var user = new User
        {
            FullName = dto.FullName.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = Roles.Participant,
            DateOfBirth = dto.DateOfBirth,
            Gender = dto.Gender,
            Phone = dto.Phone?.Trim()
        };

        _context.Users.Add(user);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Unique index hit by a concurrent registration with the same email
            return Error(400, "Email is already registered.");
        }

        return StatusCode(201, new { message = "User registered successfully." });
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponseDto>> Login([FromBody] LoginDto dto)
    {
        var email = dto.Email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user == null)
        {
            BCrypt.Net.BCrypt.Verify(dto.Password, DummyHash);
            return Error(401, InvalidCredentials);
        }

        var now = DateTime.UtcNow;
        if (user.LockoutEnd > now)
            return Error(423, "Account temporarily locked after too many failed attempts. Try again later.");

        var passwordOk = BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash);
        if (!passwordOk)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEnd = now.AddMinutes(LockoutMinutes);
                user.FailedLoginCount = 0;
            }
            await _context.SaveChangesAsync();
            return Error(401, InvalidCredentials);
        }

        if (!user.IsActive) return Error(401, InvalidCredentials);

        if (user.FailedLoginCount != 0 || user.LockoutEnd != null)
        {
            user.FailedLoginCount = 0;
            user.LockoutEnd = null;
            await _context.SaveChangesAsync();
        }

        return Ok(await _tokens.CreateSessionAsync(user));
    }

    /// <summary>Exchanges a refresh token for a new access token and a new refresh token (rotation).</summary>
    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponseDto>> Refresh([FromBody] RefreshRequestDto dto)
    {
        var result = await _tokens.RefreshAsync(dto.RefreshToken);
        return result.IsSuccess ? Ok(result.Value) : Error(result.StatusCode, result.Error!);
    }

    /// <summary>Revokes a refresh token. Always succeeds so it cannot be used to probe tokens.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequestDto dto)
    {
        await _tokens.RevokeAsync(dto.RefreshToken);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<ProfileDto>> GetProfile()
    {
        var user = await CurrentUserAsync();
        return user == null ? Error(401, "User not found.") : Ok(ToProfile(user));
    }

    [HttpPut("me")]
    [Authorize]
    public async Task<ActionResult<ProfileDto>> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        var user = await CurrentUserAsync();
        if (user == null) return Error(401, "User not found.");

        if (dto.DateOfBirth != null && dto.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
            return Error(400, "Date of birth cannot be in the future.");

        user.FullName = dto.FullName.Trim();
        user.DateOfBirth = dto.DateOfBirth;
        user.Gender = dto.Gender;
        user.Phone = dto.Phone?.Trim();
        user.EmergencyContactName = dto.EmergencyContactName?.Trim();
        user.EmergencyContactPhone = dto.EmergencyContactPhone?.Trim();

        await _context.SaveChangesAsync();
        return Ok(ToProfile(user));
    }

    /// <summary>Changes the password and signs the user out everywhere (tokens are invalidated).</summary>
    [HttpPost("change-password")]
    [Authorize]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        var user = await CurrentUserAsync();
        if (user == null) return Error(401, "User not found.");

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            return Error(400, "Current password is incorrect.");
        if (dto.CurrentPassword == dto.NewPassword)
            return Error(400, "The new password must be different from the current one.");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        user.TokenVersion++;
        await _context.SaveChangesAsync();
        await _tokens.RevokeAllAsync(user.UserId);

        return NoContent();
    }

    private async Task<User?> CurrentUserAsync()
    {
        var id = User.GetUserId();
        return id == null ? null : await _context.Users.FirstOrDefaultAsync(u => u.UserId == id && u.IsActive);
    }

    private static ProfileDto ToProfile(User u) => new(
        u.UserId, u.FullName, u.Email, u.Role, u.DateOfBirth, u.Gender, u.Phone,
        u.EmergencyContactName, u.EmergencyContactPhone, u.CreatedAt);
}
