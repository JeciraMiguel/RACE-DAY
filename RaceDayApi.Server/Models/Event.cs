using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RaceDayApi.Server.Models;

public class Event
{
    [Key]
    public int EventId { get; set; }

    [Required, MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    public DateTime EventDate { get; set; }

    public EventStatus Status { get; set; } = EventStatus.Draft;

    public DateTime? RegistrationOpensAt { get; set; }

    public DateTime? RegistrationClosesAt { get; set; }

    public int? OrganizerId { get; set; }

    [ForeignKey(nameof(OrganizerId))]
    public User? Organizer { get; set; }

    [Required]
    public int VenueId { get; set; }

    [ForeignKey(nameof(VenueId))]
    public Venue? Venue { get; set; }

    public ICollection<Registration> Registrations { get; set; } = new List<Registration>();

    public ICollection<Category> Categories { get; set; } = new List<Category>();
}