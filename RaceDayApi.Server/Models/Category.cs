using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RaceDayApi.Server.Models;

public class Category
{
    [Key]
    public int CategoryId { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Column(TypeName = "decimal(18,2)")]
    public decimal EntryFee { get; set; }

    [Column(TypeName = "decimal(8,2)")]
    public decimal? DistanceKm { get; set; }

    public TimeSpan? StartTime { get; set; }

    /// <summary>Maximum confirmed registrations; null means unlimited.</summary>
    public int? MaxParticipants { get; set; }

    public int? MinAge { get; set; }

    public int? MaxAge { get; set; }

    /// <summary>Restricts the category to one gender; null means open.</summary>
    public Gender? Gender { get; set; }

    [Required]
    public int EventId { get; set; }

    [ForeignKey(nameof(EventId))]
    public Event? Event { get; set; }

    public ICollection<Registration> Registrations { get; set; } = new List<Registration>();
}