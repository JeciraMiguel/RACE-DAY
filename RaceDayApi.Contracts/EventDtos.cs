using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Contracts;

public class CreateEventDto
{
    [Required, MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    /// <summary>Optional. Nullable on purpose: form binding turns an empty value into null.</summary>
    [MaxLength(1000)]
    public string? Description { get; set; }

    public DateTime EventDate { get; set; }

    public int VenueId { get; set; }

    public DateTime? RegistrationOpensAt { get; set; }

    public DateTime? RegistrationClosesAt { get; set; }
}

public class UpdateEventDto : CreateEventDto { }

public record EventResponseDto(
    int EventId,
    string Title,
    string Description,
    DateTime EventDate,
    int VenueId,
    string VenueName,
    string? ImageUrl,
    EventStatus Status = EventStatus.Published,
    int? OrganizerId = null,
    DateTime? RegistrationOpensAt = null,
    DateTime? RegistrationClosesAt = null,
    int CategoryCount = 0,
    decimal? MinEntryFee = null,
    int? SpotsLeft = null,
    /// <summary>Confirmed registrations across all categories (list endpoint only).</summary>
    int RegisteredCount = 0);

public record EventDetailDto(
    int EventId,
    string Title,
    string Description,
    DateTime EventDate,
    int VenueId,
    string VenueName,
    string? ImageUrl,
    EventStatus Status,
    int? OrganizerId,
    DateTime? RegistrationOpensAt,
    DateTime? RegistrationClosesAt,
    IReadOnlyList<CategoryResponseDto> Categories);
