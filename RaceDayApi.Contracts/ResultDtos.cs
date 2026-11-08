
namespace RaceDayApi.Contracts;

public record RecordTimingDto(int RegistrationId, TimeSpan? FinishTime = null, ResultStatus Status = ResultStatus.Finished);

public record UpdateResultDto(TimeSpan? FinishTime = null, ResultStatus Status = ResultStatus.Finished);

public record LeaderboardDto(int Rank, int RaceNumber, string ParticipantName, string CategoryName, TimeSpan FinishTime);

public record ResultResponseDto(
    int ResultId,
    int RegistrationId,
    int CategoryId,
    string CategoryName,
    int RaceNumber,
    string ParticipantName,
    ResultStatus Status,
    TimeSpan? FinishTime,
    int? Rank);

public record ImportError(int Line, string Message);

public record ImportResultDto(int Imported, IReadOnlyList<ImportError> Errors);

/// <summary>One of the caller's own results, with the event and how many finished in the category.</summary>
public record MyResultDto(
    int ResultId,
    int RegistrationId,
    int EventId,
    string EventTitle,
    DateTime EventDate,
    int CategoryId,
    string CategoryName,
    int RaceNumber,
    ResultStatus Status,
    TimeSpan? FinishTime,
    int? Rank,
    int Finishers);
