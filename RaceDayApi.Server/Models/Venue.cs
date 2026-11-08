using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Server.Models;

public class Venue
{
    [Key]
    public int VenueId { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(250)]
    public string Location { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    /// <summary>IANA time zone of the venue (e.g. "Africa/Johannesburg"); event times are local to it.</summary>
    [MaxLength(64)]
    public string? TimeZone { get; set; }

    public int Capacity { get; set; }

    public ICollection<Event> Events { get; set; } = new List<Event>();
}