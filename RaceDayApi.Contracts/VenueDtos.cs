using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Contracts;

public record SaveVenueDto(
    [Required, MaxLength(150)] string Name,
    [Required, MaxLength(250)] string Location,
    [Range(0, 1_000_000)] int Capacity,
    [MaxLength(100)] string? City = null,
    [MaxLength(1000)] string? Description = null,
    [MaxLength(64)] string? TimeZone = null);

public record VenueDto(int VenueId, string Name, string Location, string? City, string? Description, int Capacity, string? TimeZone = null);
