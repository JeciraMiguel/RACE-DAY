using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Contracts;

public record RegisterDto(
    [Required, MaxLength(100)] string FullName,
    [Required, EmailAddress, MaxLength(150)] string Email,
    [Required, MinLength(8), MaxLength(100), PasswordPolicy] string Password,
    DateOnly? DateOfBirth = null,
    Gender? Gender = null,
    [MaxLength(30)] string? Phone = null);

public record LoginDto(
    [Required, EmailAddress] string Email,
    [Required] string Password);

/// <summary>
/// Access token (short-lived JWT) plus a rotating refresh token.
/// <paramref name="ExpiresAt"/> is the UTC expiry of the access token.
/// </summary>
public record AuthResponseDto(string Token, string Email, string Role, string RefreshToken, DateTime ExpiresAt);

public record RefreshRequestDto([Required] string RefreshToken);

public record ProfileDto(
    int UserId,
    string FullName,
    string Email,
    string Role,
    DateOnly? DateOfBirth,
    Gender? Gender,
    string? Phone,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    DateTime CreatedAt);

public record UpdateProfileDto(
    [Required, MaxLength(100)] string FullName,
    DateOnly? DateOfBirth = null,
    Gender? Gender = null,
    [MaxLength(30)] string? Phone = null,
    [MaxLength(100)] string? EmergencyContactName = null,
    [MaxLength(30)] string? EmergencyContactPhone = null);

public record ChangePasswordDto(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(100), PasswordPolicy] string NewPassword);

public record UserSummaryDto(int UserId, string FullName, string Email, string Role, bool IsActive, DateTime CreatedAt);

public record UpdateRoleDto([Required] string Role);

public record UpdateActiveDto(bool IsActive);
