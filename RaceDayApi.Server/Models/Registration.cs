using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RaceDayApi.Server.Models;

public class Registration
{
    [Key]
    public int RegistrationId { get; set; }

    [Required]
    public int UserId { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    /// <summary>Denormalized from the category so race numbers can be unique per event.</summary>
    public int EventId { get; set; }

    [ForeignKey(nameof(EventId))]
    public Event? Event { get; set; }

    [Required]
    public int CategoryId { get; set; }

    [ForeignKey(nameof(CategoryId))]
    public Category? Category { get; set; }

    public int RaceNumber { get; set; }

    public DateTime RegistrationDate { get; set; } = DateTime.UtcNow;

    public RegistrationStatus Status { get; set; } = RegistrationStatus.Confirmed;

    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;

    public DateTime? CancelledAt { get; set; }

    public TimingResult? TimingResult { get; set; }
}