using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;
using RaceDayApi.Server.Services;

namespace RaceDayApi.Server.Controllers;

[Route("api/[controller]")]
[Authorize]
public class RegistrationsController : ApiControllerBase
{
    private readonly RaceDayDbContext _context;
    private readonly RegistrationService _registrations;

    public RegistrationsController(RaceDayDbContext context, RegistrationService registrations)
    {
        _context = context;
        _registrations = registrations;
    }

    /// <summary>
    /// The caller's own registrations (including cancelled ones). Admins can pass <c>all=true</c>
    /// to list every registration; for everyone else the parameter is ignored.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<RegistrationResponseDto>>> GetRegistrations([FromQuery] bool all = false)
    {
        var query = _context.Registrations.AsQueryable();

        if (!(all && User.IsAdmin()))
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();
            query = query.Where(r => r.UserId == userId.Value);
        }

        var rows = await query
            .OrderBy(r => r.RegistrationId)
            .Select(r => new
            {
                r.RegistrationId,
                r.CategoryId,
                CategoryName = r.Category!.Name,
                EntryFee = r.Category.EntryFee,
                r.EventId,
                EventTitle = r.Event!.Title,
                EventDate = r.Event.EventDate,
                EventStatus = r.Event.Status,
                RegistrationClosesAt = r.Event.RegistrationClosesAt,
                ParticipantName = r.User!.FullName,
                r.RaceNumber,
                r.RegistrationDate,
                r.Status,
                r.PaymentStatus,
                HasResult = r.TimingResult != null
            })
            .ToListAsync();

        // CanCancel depends on "now", so it is evaluated here rather than in SQL
        var now = DateTime.UtcNow;
        var registrations = rows.Select(r => new RegistrationResponseDto(
            r.RegistrationId, r.CategoryId, r.CategoryName, r.EventId, r.EventTitle, r.ParticipantName,
            r.RaceNumber, r.RegistrationDate, r.Status, r.PaymentStatus,
            r.EventDate, r.EventStatus, r.EntryFee, r.HasResult,
            CanCancel: r.Status == RegistrationStatus.Confirmed && !r.HasResult
                       && RegistrationService.CanCancel(r.EventStatus, r.EventDate, r.RegistrationClosesAt, now))).ToList();

        return Ok(registrations);
    }

    /// <summary>Participants of an event (organizer owning the event, or admin). Use ?format=csv to export.</summary>
    [HttpGet("/api/events/{eventId:int}/registrations")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> GetEventRegistrations(
        int eventId,
        [FromQuery] int? categoryId,
        [FromQuery] PaymentStatus? paymentStatus,
        [FromQuery] string? format)
    {
        var raceEvent = await _context.Events.FindAsync(eventId);
        if (raceEvent == null) return Error(404, $"Event with ID {eventId} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        var query = _context.Registrations.Where(r => r.EventId == eventId);
        if (categoryId != null) query = query.Where(r => r.CategoryId == categoryId);
        if (paymentStatus != null) query = query.Where(r => r.PaymentStatus == paymentStatus);

        var rows = await query
            .OrderBy(r => r.CategoryId).ThenBy(r => r.RaceNumber)
            .Select(r => new ParticipantDto(
                r.RegistrationId, r.User!.FullName, r.User.Email, r.User.Phone,
                r.CategoryId, r.Category!.Name, r.RaceNumber, r.Status, r.PaymentStatus, r.RegistrationDate))
            .ToListAsync();

        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = new StringBuilder("RaceNumber,Name,Email,Phone,Category,Status,Payment,RegisteredAt\n");
            foreach (var p in rows)
            {
                csv.AppendLine(string.Join(',',
                    p.RaceNumber, Csv(p.ParticipantName), Csv(p.Email), Csv(p.Phone), Csv(p.CategoryName),
                    p.Status, p.PaymentStatus, p.RegistrationDate.ToString("O")));
            }
            return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"registrations-{eventId}.csv");
        }

        return Ok(rows);
    }

    [HttpPost]
    public async Task<ActionResult<RegistrationResponseDto>> CreateRegistration([FromBody] CreateRegistrationDto dto)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var result = await _registrations.RegisterAsync(userId.Value, dto.CategoryId);
        if (!result.IsSuccess) return Error(result.StatusCode, result.Error!);

        return StatusCode(201, result.Value);
    }

    /// <summary>Cancels a registration. Participants may cancel their own until registration closes.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> CancelRegistration(int id)
    {
        var registration = await _context.Registrations
            .Include(r => r.Event)
            .Include(r => r.TimingResult)
            .FirstOrDefaultAsync(r => r.RegistrationId == id);
        if (registration == null) return Error(404, "Registration not found.");

        var isOwner = registration.UserId == User.GetUserId();
        var isManager = await CanManageAsync(registration.Event!);
        if (!isOwner && !isManager) return Forbid();

        if (registration.Status == RegistrationStatus.Cancelled)
            return Error(409, "Registration is already cancelled.");
        if (registration.TimingResult != null)
            return Error(409, "A registration with a recorded result cannot be cancelled.");
        if (!isManager && !RegistrationService.CanCancel(registration.Event!, DateTime.UtcNow))
            return Error(409, "The cancellation period has ended.");

        registration.Status = RegistrationStatus.Cancelled;
        registration.CancelledAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id:int}/payment")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> UpdatePayment(int id, [FromBody] UpdatePaymentDto dto)
    {
        var registration = await _context.Registrations.Include(r => r.Event).FirstOrDefaultAsync(r => r.RegistrationId == id);
        if (registration == null) return Error(404, "Registration not found.");
        if (!await CanManageAsync(registration.Event!)) return Forbid();

        registration.PaymentStatus = dto.PaymentStatus;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Quotes a CSV field and neutralises spreadsheet formula injection.</summary>
    private static string Csv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if ("=+-@\t\r".Contains(value[0])) value = "'" + value;
        return $"\"{value.Replace("\"", "\"\"")}\"";
    }
}
