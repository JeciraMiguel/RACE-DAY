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
public class CategoriesController : ApiControllerBase
{
    private readonly RaceDayDbContext _context;

    public CategoriesController(RaceDayDbContext context)
    {
        _context = context;
    }

    public static CategoryResponseDto ToDto(Category c, int registeredCount) => new(
        c.CategoryId, c.Name, c.EntryFee, c.EventId, c.DistanceKm, c.StartTime, c.MaxParticipants,
        c.MinAge, c.MaxAge, c.Gender, registeredCount,
        c.MaxParticipants == null ? null : Math.Max(c.MaxParticipants.Value - registeredCount, 0));

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CategoryResponseDto>>> GetCategories([FromQuery] int? eventId)
    {
        // Categories of draft events are only visible to their owner and admins
        var visibleEvents = _context.Events.VisibleTo(User);
        var query = _context.Categories.Where(c => visibleEvents.Any(e => e.EventId == c.EventId));

        if (eventId.HasValue)
            query = query.Where(c => c.EventId == eventId.Value);

        var rows = await query
            .OrderBy(c => c.CategoryId)
            .Select(c => new
            {
                Category = c,
                Count = c.Registrations.Count(r => r.Status == RegistrationStatus.Confirmed)
            })
            .ToListAsync();

        return Ok(rows.Select(x => ToDto(x.Category, x.Count)));
    }

    [HttpPost]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<ActionResult<CategoryResponseDto>> CreateCategory([FromBody] CreateCategoryDto dto)
    {
        var raceEvent = await _context.Events.FindAsync(dto.EventId);
        if (raceEvent == null) return Error(400, "Associated Event does not exist.");
        if (!await CanManageAsync(raceEvent)) return Forbid();
        if (raceEvent.Status is EventStatus.Cancelled or EventStatus.Completed)
            return Error(409, $"Categories cannot be added to a {raceEvent.Status} event.");

        var error = ValidateRules(dto.MinAge, dto.MaxAge);
        if (error != null) return Error(400, error);

        var category = new Category
        {
            Name = dto.Name,
            EntryFee = dto.EntryFee,
            EventId = dto.EventId,
            DistanceKm = dto.DistanceKm,
            StartTime = dto.StartTime,
            MaxParticipants = dto.MaxParticipants,
            MinAge = dto.MinAge,
            MaxAge = dto.MaxAge,
            Gender = dto.Gender
        };

        _context.Categories.Add(category);
        await _context.SaveChangesAsync();

        return StatusCode(201, ToDto(category, 0));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryDto dto)
    {
        var category = await _context.Categories.Include(c => c.Event).FirstOrDefaultAsync(c => c.CategoryId == id);
        if (category == null) return Error(404, $"Category {id} not found.");
        if (!await CanManageAsync(category.Event!)) return Forbid();

        var error = ValidateRules(dto.MinAge, dto.MaxAge);
        if (error != null) return Error(400, error);

        var confirmed = await _context.Registrations
            .CountAsync(r => r.CategoryId == id && r.Status == RegistrationStatus.Confirmed);
        if (dto.MaxParticipants != null && dto.MaxParticipants < confirmed)
            return Error(409, $"MaxParticipants cannot be lower than the {confirmed} current registrations.");

        category.Name = dto.Name;
        category.EntryFee = dto.EntryFee;
        category.DistanceKm = dto.DistanceKm;
        category.StartTime = dto.StartTime;
        category.MaxParticipants = dto.MaxParticipants;
        category.MinAge = dto.MinAge;
        category.MaxAge = dto.MaxAge;
        category.Gender = dto.Gender;

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        var category = await _context.Categories.Include(c => c.Event).FirstOrDefaultAsync(c => c.CategoryId == id);
        if (category == null) return Error(404, $"Category {id} not found.");
        if (!await CanManageAsync(category.Event!)) return Forbid();

        if (await _context.Registrations.AnyAsync(r => r.CategoryId == id))
            return Error(409, "Category has registrations and cannot be deleted.");

        _context.Categories.Remove(category);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static string? ValidateRules(int? minAge, int? maxAge) =>
        minAge != null && maxAge != null && minAge > maxAge ? "MinAge cannot be greater than MaxAge." : null;
}
