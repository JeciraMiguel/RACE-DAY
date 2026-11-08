namespace RaceDayApi.Contracts;

public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public record StatsDto(
    IReadOnlyDictionary<string, int> EventsByStatus,
    int Users,
    int ConfirmedRegistrations,
    int ResultsRecorded);
