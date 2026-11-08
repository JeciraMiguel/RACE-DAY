using System.Globalization;
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
public class ResultsController : ApiControllerBase
{
    private const long MaxImportBytes = 1024 * 1024;

    private readonly RaceDayDbContext _context;
    private readonly RankingService _ranking;

    public ResultsController(RaceDayDbContext context, RankingService ranking)
    {
        _context = context;
        _ranking = ranking;
    }

    /// <summary>Records (or replaces) the result of a registration and recalculates the category ranking.</summary>
    [HttpPost]
    [Authorize(Policy = Policies.CanRecordResults)]
    public async Task<IActionResult> RecordTiming([FromBody] RecordTimingDto dto)
    {
        var registration = await _context.Registrations
            .Include(r => r.Event)
            .FirstOrDefaultAsync(r => r.RegistrationId == dto.RegistrationId);
        if (registration == null) return Error(404, "Registration record not found.");
        if (!await CanManageAsync(registration.Event!)) return Forbid();
        if (registration.Status != RegistrationStatus.Confirmed)
            return Error(409, "Results can only be recorded for confirmed registrations.");

        var error = ValidateResult(dto.Status, dto.FinishTime);
        if (error != null) return Error(400, error);

        var result = await _context.TimingResults.FirstOrDefaultAsync(t => t.RegistrationId == dto.RegistrationId);
        if (result == null)
        {
            result = new TimingResult { RegistrationId = dto.RegistrationId };
            _context.TimingResults.Add(result);
        }

        Apply(result, dto.Status, dto.FinishTime);

        await _context.SaveChangesAsync();
        await _ranking.RecalculateAsync(registration.CategoryId);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Timing result recorded and leaderboard recalculated." });
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.CanRecordResults)]
    public async Task<IActionResult> UpdateResult(int id, [FromBody] UpdateResultDto dto)
    {
        var result = await _context.TimingResults
            .Include(t => t.Registration).ThenInclude(r => r!.Event)
            .FirstOrDefaultAsync(t => t.TimingResultId == id);
        if (result == null) return Error(404, "Result not found.");
        if (!await CanManageAsync(result.Registration!.Event!)) return Forbid();

        var error = ValidateResult(dto.Status, dto.FinishTime);
        if (error != null) return Error(400, error);

        Apply(result, dto.Status, dto.FinishTime);

        await _context.SaveChangesAsync();
        await _ranking.RecalculateAsync(result.Registration.CategoryId);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.CanRecordResults)]
    public async Task<IActionResult> DeleteResult(int id)
    {
        var result = await _context.TimingResults
            .Include(t => t.Registration).ThenInclude(r => r!.Event)
            .FirstOrDefaultAsync(t => t.TimingResultId == id);
        if (result == null) return Error(404, "Result not found.");
        if (!await CanManageAsync(result.Registration!.Event!)) return Forbid();

        var categoryId = result.Registration.CategoryId;
        _context.TimingResults.Remove(result);
        await _context.SaveChangesAsync();

        await _ranking.RecalculateAsync(categoryId);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Bulk import from a CSV file (multipart field "file"): <c>raceNumber,finishTime[,status]</c>.
    /// finishTime is mm:ss or h:mm:ss with optional fractions (39:30, 1:02:03, 00:39:30.5); status defaults to
    /// Finished (DNF/DNS/DSQ need no time).
    /// </summary>
    [HttpPost("import")]
    [Authorize(Policy = Policies.CanRecordResults)]
    public async Task<ActionResult<ImportResultDto>> Import([FromQuery] int eventId, IFormFile file)
    {
        var raceEvent = await _context.Events.FindAsync(eventId);
        if (raceEvent == null) return Error(404, $"Event with ID {eventId} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        if (file == null || file.Length == 0) return Error(400, "A CSV file is required.");
        if (file.Length > MaxImportBytes) return Error(400, "CSV file must be 1 MB or smaller.");

        var registrations = await _context.Registrations
            .Where(r => r.EventId == eventId && r.Status == RegistrationStatus.Confirmed)
            .Include(r => r.TimingResult)
            .ToDictionaryAsync(r => r.RaceNumber);

        var errors = new List<ImportError>();
        var categories = new HashSet<int>();
        var imported = 0;
        var lineNumber = 0;

        using var reader = new StreamReader(file.OpenReadStream());
        while (await reader.ReadLineAsync() is { } line)
        {
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var parts = line.Split(',').Select(p => p.Trim()).ToArray();
            if (!int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var raceNumber))
            {
                // Tolerate a header on the first line only
                if (lineNumber == 1) continue;
                errors.Add(new ImportError(lineNumber, "Invalid race number."));
                continue;
            }

            if (!registrations.TryGetValue(raceNumber, out var registration))
            {
                errors.Add(new ImportError(lineNumber, $"No confirmed registration with race number {raceNumber}."));
                continue;
            }

            var status = ResultStatus.Finished;
            if (parts.Length > 2 && !string.IsNullOrEmpty(parts[2])
                && !Enum.TryParse(parts[2], ignoreCase: true, out status))
            {
                errors.Add(new ImportError(lineNumber, $"Unknown status '{parts[2]}'."));
                continue;
            }

            TimeSpan? time = null;
            if (parts.Length > 1 && !string.IsNullOrEmpty(parts[1]))
            {
                if (!TryParseFinishTime(parts[1], out var parsed))
                {
                    errors.Add(new ImportError(lineNumber, "Finish time must be mm:ss or h:mm:ss."));
                    continue;
                }
                time = parsed;
            }

            var validation = ValidateResult(status, time);
            if (validation != null)
            {
                errors.Add(new ImportError(lineNumber, validation));
                continue;
            }

            var result = registration.TimingResult;
            if (result == null)
            {
                result = new TimingResult { Registration = registration };
                registration.TimingResult = result;
                _context.TimingResults.Add(result);
            }

            Apply(result, status, time);
            categories.Add(registration.CategoryId);
            imported++;
        }

        await _context.SaveChangesAsync();
        foreach (var categoryId in categories)
            await _ranking.RecalculateAsync(categoryId);
        await _context.SaveChangesAsync();

        return Ok(new ImportResultDto(imported, errors));
    }

    /// <summary>The caller's own results, newest event first, with how many finished in each category.</summary>
    [HttpGet("mine")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<MyResultDto>>> GetMyResults()
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var mine = await _context.TimingResults
            .Where(t => t.Registration!.UserId == userId)
            .Select(t => new
            {
                t.TimingResultId,
                t.RegistrationId,
                EventId = t.Registration!.EventId,
                EventTitle = t.Registration.Event!.Title,
                EventDate = t.Registration.Event.EventDate,
                CategoryId = t.Registration.CategoryId,
                CategoryName = t.Registration.Category!.Name,
                t.Registration.RaceNumber,
                t.Status,
                t.FinishTime,
                t.OverallRank
            })
            .ToListAsync();

        var categoryIds = mine.Select(r => r.CategoryId).Distinct().ToList();
        var finishers = await _context.TimingResults
            .Where(t => categoryIds.Contains(t.Registration!.CategoryId) && t.Status == ResultStatus.Finished)
            .GroupBy(t => t.Registration!.CategoryId)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CategoryId, x => x.Count);

        var result = mine
            .OrderByDescending(r => r.EventDate)
            .Select(r => new MyResultDto(
                r.TimingResultId, r.RegistrationId, r.EventId, r.EventTitle, r.EventDate, r.CategoryId,
                r.CategoryName, r.RaceNumber, r.Status, r.FinishTime, r.OverallRank,
                finishers.GetValueOrDefault(r.CategoryId)))
            .ToList();

        return Ok(result);
    }

    /// <summary>All results of an event, including DNF/DNS/DSQ (not available for draft events).</summary>
    [HttpGet("event/{eventId:int}")]
    public async Task<ActionResult<IEnumerable<ResultResponseDto>>> GetEventResults(int eventId)
    {
        if (!await _context.Events.VisibleTo(User).AnyAsync(e => e.EventId == eventId))
            return Error(404, $"Event with ID {eventId} not found.");

        var rows = await _context.TimingResults
            .Where(t => t.Registration!.EventId == eventId)
            .Select(t => new ResultResponseDto(
                t.TimingResultId, t.RegistrationId, t.Registration!.CategoryId, t.Registration.Category!.Name,
                t.Registration.RaceNumber, t.Registration.User!.FullName, t.Status, t.FinishTime, t.OverallRank))
            .ToListAsync();

        // Order after materializing: SQLite cannot ORDER BY TimeSpan
        return Ok(rows
            .OrderBy(r => r.CategoryId)
            .ThenBy(r => r.Rank ?? int.MaxValue)
            .ThenBy(r => r.RaceNumber));
    }

    [HttpGet("leaderboard/{categoryId:int}")]
    public async Task<ActionResult<IEnumerable<LeaderboardDto>>> GetLeaderboard(int categoryId)
    {
        var visibleEvents = _context.Events.VisibleTo(User);

        var rows = await _context.TimingResults
            .Where(t => t.Registration!.CategoryId == categoryId
                        && t.Status == ResultStatus.Finished && t.FinishTime != null
                        && visibleEvents.Any(e => e.EventId == t.Registration.EventId))
            .Select(t => new LeaderboardDto(
                t.OverallRank ?? 0,
                t.Registration!.RaceNumber,
                t.Registration.User!.FullName,
                t.Registration.Category!.Name,
                t.FinishTime!.Value))
            .ToListAsync();

        // SQLite cannot ORDER BY a TimeSpan column, so sort after materializing
        return Ok(rows.OrderBy(r => r.FinishTime).ThenBy(r => r.RaceNumber).ToList());
    }

    private static readonly System.Text.RegularExpressions.Regex FinishTimePattern =
        new(@"^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.(\d{1,7}))?$", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>Two parts are minutes:seconds ("39:30"), three are hours:minutes:seconds ("1:02:03").</summary>
    private static bool TryParseFinishTime(string value, out TimeSpan time)
    {
        time = default;
        var match = FinishTimePattern.Match(value);
        if (!match.Success) return false;

        var hasHours = match.Groups[1].Success;
        var minutes = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        var seconds = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        if (seconds > 59 || (hasHours && minutes > 59)) return false;

        var hours = hasHours ? int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : 0;
        var fraction = match.Groups[4].Success
            ? double.Parse("0." + match.Groups[4].Value, CultureInfo.InvariantCulture)
            : 0;

        time = TimeSpan.FromHours(hours) + TimeSpan.FromMinutes(minutes) + TimeSpan.FromSeconds(seconds + fraction);
        return true;
    }

    private static string? ValidateResult(ResultStatus status, TimeSpan? finishTime)
    {
        if (status == ResultStatus.Finished)
            return finishTime is { } t && t > TimeSpan.Zero ? null : "FinishTime must be greater than zero for a finished result.";
        return finishTime != null ? $"A {status} result must not have a finish time." : null;
    }

    private static void Apply(TimingResult result, ResultStatus status, TimeSpan? finishTime)
    {
        result.Status = status;
        result.FinishTime = status == ResultStatus.Finished ? finishTime : null;
        result.RecordedAt = DateTime.UtcNow;
    }
}
