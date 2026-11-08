using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Contracts;

public record CreateCategoryDto(
    [Required, MaxLength(100)] string Name,
    [Range(0, 1_000_000)] decimal EntryFee,
    int EventId,
    [Range(0.01, 1000)] decimal? DistanceKm = null,
    TimeSpan? StartTime = null,
    [Range(1, 1_000_000)] int? MaxParticipants = null,
    [Range(0, 120)] int? MinAge = null,
    [Range(0, 120)] int? MaxAge = null,
    Gender? Gender = null);

public record UpdateCategoryDto(
    [Required, MaxLength(100)] string Name,
    [Range(0, 1_000_000)] decimal EntryFee,
    [Range(0.01, 1000)] decimal? DistanceKm = null,
    TimeSpan? StartTime = null,
    [Range(1, 1_000_000)] int? MaxParticipants = null,
    [Range(0, 120)] int? MinAge = null,
    [Range(0, 120)] int? MaxAge = null,
    Gender? Gender = null);

public record CategoryResponseDto(
    int CategoryId,
    string Name,
    decimal EntryFee,
    int EventId,
    decimal? DistanceKm = null,
    TimeSpan? StartTime = null,
    int? MaxParticipants = null,
    int? MinAge = null,
    int? MaxAge = null,
    Gender? Gender = null,
    int RegisteredCount = 0,
    int? SpotsLeft = null);
