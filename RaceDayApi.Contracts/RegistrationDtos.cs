
namespace RaceDayApi.Contracts;

public record CreateRegistrationDto(int CategoryId);

public record RegistrationResponseDto(
    int RegistrationId,
    int CategoryId,
    string CategoryName,
    int EventId,
    string EventTitle,
    string ParticipantName,
    int RaceNumber,
    DateTime RegistrationDate,
    RegistrationStatus Status = RegistrationStatus.Confirmed,
    PaymentStatus PaymentStatus = PaymentStatus.Pending,
    DateTime EventDate = default,
    EventStatus EventStatus = EventStatus.Published,
    decimal EntryFee = 0,
    bool HasResult = false,
    /// <summary>True when the caller may still cancel this registration (server rules).</summary>
    bool CanCancel = false);

public record ParticipantDto(
    int RegistrationId,
    string ParticipantName,
    string Email,
    string? Phone,
    int CategoryId,
    string CategoryName,
    int RaceNumber,
    RegistrationStatus Status,
    PaymentStatus PaymentStatus,
    DateTime RegistrationDate);

public record UpdatePaymentDto(PaymentStatus PaymentStatus);
