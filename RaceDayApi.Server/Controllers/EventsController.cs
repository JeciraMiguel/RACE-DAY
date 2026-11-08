using System.Linq.Expressions;
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
public class EventsController : ApiControllerBase
{
    private const string BannerContainer = "event-banners";

    private static readonly Expression<Func<Event, EventResponseDto>> ToResponse = e => new EventResponseDto(
        e.EventId, e.Title, e.Description, e.EventDate, e.VenueId, e.Venue!.Name, e.ImageUrl,
        e.Status, e.OrganizerId, e.RegistrationOpensAt, e.RegistrationClosesAt);

    private readonly RaceDayDbContext _context;
    private readonly IBlobService _blobService;
    private readonly ILogger<EventsController> _logger;

    public EventsController(RaceDayDbContext context, IBlobService blobService, ILogger<EventsController> logger)
    {
        _context = context;
        _blobService = blobService;
        _logger = logger;
    }

    /// <summary>Lists events visible to the caller, with optional search, status and date filters.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<EventResponseDto>>> GetEvents(
        [FromQuery] string? search,
        [FromQuery] EventStatus? status,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] bool newestFirst = false,
        [FromQuery] bool mine = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var query = _context.Events.VisibleTo(User);

        // Organizer dashboards: only the events the caller owns
        if (mine)
        {
            var userId = User.GetUserId();
            query = userId == null ? query.Where(_ => false) : query.Where(e => e.OrganizerId == userId);
        }

        if (status != null) query = query.Where(e => e.Status == status);
        if (from != null) query = query.Where(e => e.EventDate >= from);
        if (to != null) query = query.Where(e => e.EventDate <= to);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{search.Trim()}%";
            query = query.Where(e => EF.Functions.Like(e.Title, pattern) || EF.Functions.Like(e.Description, pattern));
        }

        var ordered = newestFirst
            ? query.OrderByDescending(e => e.EventDate).ThenByDescending(e => e.EventId)
            : query.OrderBy(e => e.EventDate).ThenBy(e => e.EventId);

        var paged = await ordered.Select(ToResponse).ToPagedAsync(page, pageSize);
        return Ok(await WithAvailabilityAsync(paged));
    }

    /// <summary>
    /// Adds the numbers shown on event cards: category count, cheapest entry fee and remaining spots
    /// (limited by category capacities and the venue capacity; null when nothing limits it).
    /// Aggregated in memory because SQLite cannot aggregate decimals.
    /// </summary>
    private async Task<PagedResult<EventResponseDto>> WithAvailabilityAsync(PagedResult<EventResponseDto> page)
    {
        var eventIds = page.Items.Select(e => e.EventId).ToList();
        var venueIds = page.Items.Select(e => e.VenueId).Distinct().ToList();

        var categories = await _context.Categories
            .Where(c => eventIds.Contains(c.EventId))
            .Select(c => new
            {
                c.EventId,
                c.EntryFee,
                c.MaxParticipants,
                Registered = c.Registrations.Count(r => r.Status == RegistrationStatus.Confirmed)
            })
            .ToListAsync();

        var venueCapacity = await _context.Venues
            .Where(v => venueIds.Contains(v.VenueId))
            .ToDictionaryAsync(v => v.VenueId, v => v.Capacity);

        var items = page.Items.Select(e =>
        {
            var mine = categories.Where(c => c.EventId == e.EventId).ToList();

            var limits = new List<int>();
            if (mine.Count > 0 && mine.All(c => c.MaxParticipants != null))
                limits.Add(mine.Sum(c => Math.Max(c.MaxParticipants!.Value - c.Registered, 0)));
            if (venueCapacity.TryGetValue(e.VenueId, out var capacity) && capacity > 0)
                limits.Add(Math.Max(capacity - mine.Sum(c => c.Registered), 0));

            return e with
            {
                CategoryCount = mine.Count,
                MinEntryFee = mine.Count > 0 ? mine.Min(c => c.EntryFee) : null,
                SpotsLeft = limits.Count > 0 ? limits.Min() : null,
                RegisteredCount = mine.Sum(c => c.Registered)
            };
        }).ToList();

        return page with { Items = items };
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> GetEvent(int id)
    {
        var e = await _context.Events.VisibleTo(User)
            .Where(ev => ev.EventId == id)
            .Select(ToResponse)
            .FirstOrDefaultAsync();
        if (e == null) return Error(404, $"Event with ID {id} not found.");

        var categories = await _context.Categories
            .Where(c => c.EventId == id)
            .OrderBy(c => c.CategoryId)
            .Select(c => new
            {
                Category = c,
                Count = c.Registrations.Count(r => r.Status == RegistrationStatus.Confirmed)
            })
            .ToListAsync();

        var categoryDtos = categories.Select(x => CategoriesController.ToDto(x.Category, x.Count)).ToList();

        return Ok(new EventDetailDto(
            e.EventId, e.Title, e.Description, e.EventDate, e.VenueId, e.VenueName, e.ImageUrl,
            e.Status, e.OrganizerId, e.RegistrationOpensAt, e.RegistrationClosesAt, categoryDtos));
    }

    /// <summary>Creates a draft event owned by the caller. Publish it with POST /{id}/publish.</summary>
    [HttpPost]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<ActionResult<EventResponseDto>> CreateEvent([FromForm] CreateEventDto dto, IFormFile? imageFile)
    {
        var venue = await _context.Venues.FindAsync(dto.VenueId);
        if (venue == null) return Error(400, $"Invalid VenueId provided: {dto.VenueId}");

        var windowError = ValidateWindow(dto);
        if (windowError != null) return Error(400, windowError);

        var imageError = ImageValidator.Validate(imageFile);
        if (imageError != null) return Error(400, imageError);

        string? imageUrl = null;
        if (imageFile is { Length: > 0 })
            imageUrl = await _blobService.UploadFileAsync(imageFile, BannerContainer);

        var raceEvent = new Event
        {
            Title = dto.Title,
            Description = dto.Description?.Trim() ?? string.Empty,
            EventDate = dto.EventDate,
            VenueId = dto.VenueId,
            ImageUrl = imageUrl,
            Status = EventStatus.Draft,
            OrganizerId = User.GetUserId(),
            RegistrationOpensAt = dto.RegistrationOpensAt,
            RegistrationClosesAt = dto.RegistrationClosesAt
        };

        _context.Events.Add(raceEvent);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch
        {
            await TryDeleteBlobAsync(imageUrl);
            throw;
        }

        var response = new EventResponseDto(
            raceEvent.EventId, raceEvent.Title, raceEvent.Description, raceEvent.EventDate,
            raceEvent.VenueId, venue.Name, raceEvent.ImageUrl, raceEvent.Status, raceEvent.OrganizerId,
            raceEvent.RegistrationOpensAt, raceEvent.RegistrationClosesAt);
        return CreatedAtAction(nameof(GetEvent), new { id = raceEvent.EventId }, response);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> UpdateEvent(int id, [FromForm] UpdateEventDto dto, IFormFile? imageFile)
    {
        var raceEvent = await _context.Events.FindAsync(id);
        if (raceEvent == null) return Error(404, $"Event with ID {id} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        if (raceEvent.Status is EventStatus.Cancelled or EventStatus.Completed)
            return Error(409, $"A {raceEvent.Status} event cannot be edited.");

        if (!await _context.Venues.AnyAsync(v => v.VenueId == dto.VenueId))
            return Error(400, $"Invalid VenueId provided: {dto.VenueId}");

        var windowError = ValidateWindow(dto);
        if (windowError != null) return Error(400, windowError);

        var imageError = ImageValidator.Validate(imageFile);
        if (imageError != null) return Error(400, imageError);

        string? oldImageUrl = null;
        string? newImageUrl = null;
        if (imageFile is { Length: > 0 })
        {
            oldImageUrl = raceEvent.ImageUrl;
            newImageUrl = await _blobService.UploadFileAsync(imageFile, BannerContainer);
            raceEvent.ImageUrl = newImageUrl;
        }

        raceEvent.Title = dto.Title;
        raceEvent.Description = dto.Description?.Trim() ?? string.Empty;
        raceEvent.EventDate = dto.EventDate;
        raceEvent.VenueId = dto.VenueId;
        raceEvent.RegistrationOpensAt = dto.RegistrationOpensAt;
        raceEvent.RegistrationClosesAt = dto.RegistrationClosesAt;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch
        {
            await TryDeleteBlobAsync(newImageUrl);
            throw;
        }

        // Only remove the previous image once the new state is safely stored
        await TryDeleteBlobAsync(oldImageUrl);
        return NoContent();
    }

    /// <summary>Draft -> Published. Requires a future date and at least one category.</summary>
    [HttpPost("{id:int}/publish")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> Publish(int id)
    {
        var raceEvent = await _context.Events.FindAsync(id);
        if (raceEvent == null) return Error(404, $"Event with ID {id} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        if (raceEvent.Status != EventStatus.Draft)
            return Error(409, $"Only draft events can be published (current: {raceEvent.Status}).");
        if (raceEvent.EventDate <= DateTime.UtcNow)
            return Error(409, "The event date must be in the future.");
        if (!await _context.Categories.AnyAsync(c => c.EventId == id))
            return Error(409, "Add at least one category before publishing.");

        raceEvent.Status = EventStatus.Published;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Draft or Published -> Cancelled.</summary>
    [HttpPost("{id:int}/cancel")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> Cancel(int id)
    {
        var raceEvent = await _context.Events.FindAsync(id);
        if (raceEvent == null) return Error(404, $"Event with ID {id} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        if (raceEvent.Status is not (EventStatus.Draft or EventStatus.Published))
            return Error(409, $"A {raceEvent.Status} event cannot be cancelled.");

        raceEvent.Status = EventStatus.Cancelled;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Published -> Completed (results are final).</summary>
    [HttpPost("{id:int}/complete")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> Complete(int id)
    {
        var raceEvent = await _context.Events.FindAsync(id);
        if (raceEvent == null) return Error(404, $"Event with ID {id} not found.");
        if (!await CanManageAsync(raceEvent)) return Forbid();

        if (raceEvent.Status != EventStatus.Published)
            return Error(409, "Only published events can be completed.");

        raceEvent.Status = EventStatus.Completed;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOnly)]
    public async Task<IActionResult> DeleteEvent(int id)
    {
        var raceEvent = await _context.Events.FindAsync(id);
        if (raceEvent == null) return Error(404, $"Event with ID {id} not found.");

        if (await _context.Registrations.AnyAsync(r => r.EventId == id))
            return Error(409, "Event has registrations and cannot be deleted.");

        var imageUrl = raceEvent.ImageUrl;

        _context.Events.Remove(raceEvent);
        await _context.SaveChangesAsync();

        await TryDeleteBlobAsync(imageUrl);
        return NoContent();
    }

    private static string? ValidateWindow(CreateEventDto dto)
    {
        if (dto.RegistrationOpensAt != null && dto.RegistrationClosesAt != null
            && dto.RegistrationOpensAt >= dto.RegistrationClosesAt)
            return "RegistrationOpensAt must be before RegistrationClosesAt.";
        if (dto.RegistrationClosesAt != null && dto.RegistrationClosesAt > dto.EventDate)
            return "RegistrationClosesAt cannot be after the event date.";
        return null;
    }

    private async Task TryDeleteBlobAsync(string? url)
    {
        if (string.IsNullOrEmpty(url)) return;
        try
        {
            await _blobService.DeleteFileAsync(url, BannerContainer);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete blob {Url}", url);
        }
    }
}
