using System.Data;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;

namespace RaceDayApi.Server.Services;

public class RegistrationService
{
    private const int MaxRaceNumberAttempts = 5;

    private readonly RaceDayDbContext _context;

    public RegistrationService(RaceDayDbContext context) => _context = context;

    public static bool IsRegistrationOpen(Event e, DateTime now) =>
        e.Status == EventStatus.Published
        && now < e.EventDate
        && (e.RegistrationOpensAt == null || now >= e.RegistrationOpensAt)
        && (e.RegistrationClosesAt == null || now <= e.RegistrationClosesAt);

    /// <summary>Participants may cancel until registration closes (or the event starts when no close date is set).</summary>
    public static bool CanCancel(Event e, DateTime now) =>
        CanCancel(e.Status, e.EventDate, e.RegistrationClosesAt, now);

    public static bool CanCancel(EventStatus status, DateTime eventDate, DateTime? registrationClosesAt, DateTime now) =>
        status is EventStatus.Published or EventStatus.Draft
        && now < (registrationClosesAt ?? eventDate);

    public async Task<ServiceResult<RegistrationResponseDto>> RegisterAsync(int userId, int categoryId)
    {
        var category = await _context.Categories
            .Include(c => c.Event).ThenInclude(e => e!.Venue)
            .FirstOrDefaultAsync(c => c.CategoryId == categoryId);
        if (category == null)
            return ServiceResult<RegistrationResponseDto>.Fail(400, $"Category {categoryId} does not exist.");

        var raceEvent = category.Event!;
        var now = DateTime.UtcNow;

        if (raceEvent.Status != EventStatus.Published)
            return ServiceResult<RegistrationResponseDto>.Fail(409, "This event is not open for registration.");
        if (!IsRegistrationOpen(raceEvent, now))
            return ServiceResult<RegistrationResponseDto>.Fail(409, "Registration is closed for this event.");

        var user = await _context.Users.FindAsync(userId);
        if (user == null || !user.IsActive)
            return ServiceResult<RegistrationResponseDto>.Fail(401, "User not found.");

        var eligibility = CheckEligibility(user, category, raceEvent.EventDate);
        if (eligibility != null)
            return ServiceResult<RegistrationResponseDto>.Fail(422, eligibility);

        for (int attempt = 0; attempt < MaxRaceNumberAttempts; attempt++)
        {
            // Capacity checks and the race number must be decided on the same snapshot: a serializable
            // transaction (BEGIN IMMEDIATE on SQLite) makes concurrent registrations queue up instead of
            // all reading the same count. The unique (EventId, RaceNumber) index stays as a safety net.
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

            var existing = await _context.Registrations
                .FirstOrDefaultAsync(r => r.UserId == userId && r.CategoryId == categoryId);
            if (existing is { Status: RegistrationStatus.Confirmed })
                return ServiceResult<RegistrationResponseDto>.Fail(409, "You are already registered for this category.");

            // Capacity checks (confirmed registrations only)
            if (category.MaxParticipants != null)
            {
                var inCategory = await _context.Registrations
                    .CountAsync(r => r.CategoryId == categoryId && r.Status == RegistrationStatus.Confirmed);
                if (inCategory >= category.MaxParticipants)
                    return ServiceResult<RegistrationResponseDto>.Fail(409, "This category is full.");
            }

            var venueCapacity = raceEvent.Venue?.Capacity ?? 0;
            if (venueCapacity > 0)
            {
                var inEvent = await _context.Registrations
                    .CountAsync(r => r.EventId == raceEvent.EventId && r.Status == RegistrationStatus.Confirmed);
                if (inEvent >= venueCapacity)
                    return ServiceResult<RegistrationResponseDto>.Fail(409, "The venue capacity for this event has been reached.");
            }

            // Numbers are never reused within an event, cancelled rows keep theirs
            var maxNumber = await _context.Registrations
                .Where(r => r.EventId == raceEvent.EventId)
                .Select(r => (int?)r.RaceNumber)
                .MaxAsync() ?? 0;

            Registration registration;
            if (existing != null)
            {
                // Re-registering after a cancellation reuses the row
                registration = existing;
                registration.Status = RegistrationStatus.Confirmed;
                registration.CancelledAt = null;
                registration.PaymentStatus = PaymentStatus.Pending;
                registration.RegistrationDate = now;
                registration.RaceNumber = maxNumber + 1;
            }
            else
            {
                registration = new Registration
                {
                    UserId = userId,
                    CategoryId = categoryId,
                    EventId = raceEvent.EventId,
                    RaceNumber = maxNumber + 1,
                    RegistrationDate = now
                };
                _context.Registrations.Add(registration);
            }

            try
            {
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (DbUpdateException)
            {
                // Lost a race for the race number (unique index): reload and retry
                if (existing == null) _context.Entry(registration).State = EntityState.Detached;
                else await _context.Entry(registration).ReloadAsync();
                continue;
            }

            return ServiceResult<RegistrationResponseDto>.Success(
                new RegistrationResponseDto(
                    registration.RegistrationId, category.CategoryId, category.Name,
                    raceEvent.EventId, raceEvent.Title, user.FullName,
                    registration.RaceNumber, registration.RegistrationDate,
                    registration.Status, registration.PaymentStatus,
                    raceEvent.EventDate, raceEvent.Status, category.EntryFee, HasResult: false,
                    CanCancel: CanCancel(raceEvent, now)),
                201);
        }

        return ServiceResult<RegistrationResponseDto>.Fail(409, "Could not complete the registration, please try again.");
    }

    private static string? CheckEligibility(User user, Category category, DateTime eventDate)
    {
        if (category.Gender != null)
        {
            if (user.Gender == null) return "Complete your profile (gender) to register for this category.";
            if (user.Gender != category.Gender) return $"This category is restricted to {category.Gender}.";
        }

        if (category.MinAge != null || category.MaxAge != null)
        {
            if (user.DateOfBirth == null) return "Complete your profile (date of birth) to register for this category.";

            var date = DateOnly.FromDateTime(eventDate);
            var age = date.Year - user.DateOfBirth.Value.Year;
            if (user.DateOfBirth.Value.AddYears(age) > date) age--;

            if (category.MinAge != null && age < category.MinAge) return $"Minimum age for this category is {category.MinAge}.";
            if (category.MaxAge != null && age > category.MaxAge) return $"Maximum age for this category is {category.MaxAge}.";
        }

        return null;
    }
}
