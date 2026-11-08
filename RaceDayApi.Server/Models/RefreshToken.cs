using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RaceDayApi.Server.Models;

/// <summary>Only a SHA-256 hash of the refresh token is stored.</summary>
public class RefreshToken
{
    [Key]
    public int RefreshTokenId { get; set; }

    public int UserId { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    [Required, MaxLength(64)]
    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime ExpiresAt { get; set; }

    /// <summary>Set when the token was used (rotated), logged out or force-revoked.</summary>
    public DateTime? RevokedAt { get; set; }

    /// <summary>Set only when the token was exchanged for a new one (not on logout or forced revocation).</summary>
    public DateTime? RotatedAt { get; set; }
}
