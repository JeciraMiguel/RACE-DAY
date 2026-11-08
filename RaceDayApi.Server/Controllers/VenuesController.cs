using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;

namespace RaceDayApi.Server.Controllers;

[Route("api/[controller]")]
public class VenuesController : ApiControllerBase
{
    private readonly RaceDayDbContext _context;

    public VenuesController(RaceDayDbContext context) => _context = context;

    private static VenueDto ToDto(Venue v) => new(v.VenueId, v.Name, v.Location, v.City, v.Description, v.Capacity, v.TimeZone);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<VenueDto>>> GetVenues()
    {
        var venues = await _context.Venues.OrderBy(v => v.Name).ToListAsync();
        return Ok(venues.Select(ToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<VenueDto>> GetVenue(int id)
    {
        var venue = await _context.Venues.FindAsync(id);
        return venue == null ? Error(404, $"Venue {id} not found.") : Ok(ToDto(venue));
    }

    [HttpPost]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<ActionResult<VenueDto>> CreateVenue([FromBody] SaveVenueDto dto)
    {
        if (!IsValidTimeZone(dto.TimeZone)) return Error(400, "TimeZone must be a valid IANA time zone such as Africa/Johannesburg.");

        var venue = new Venue();
        Apply(venue, dto);
        _context.Venues.Add(venue);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetVenue), new { id = venue.VenueId }, ToDto(venue));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> UpdateVenue(int id, [FromBody] SaveVenueDto dto)
    {
        var venue = await _context.Venues.FindAsync(id);
        if (venue == null) return Error(404, $"Venue {id} not found.");

        if (!IsValidTimeZone(dto.TimeZone)) return Error(400, "TimeZone must be a valid IANA time zone such as Africa/Johannesburg.");

        Apply(venue, dto);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.CanManageEvents)]
    public async Task<IActionResult> DeleteVenue(int id)
    {
        var venue = await _context.Venues.FindAsync(id);
        if (venue == null) return Error(404, $"Venue {id} not found.");

        if (await _context.Events.AnyAsync(e => e.VenueId == id))
            return Error(409, "Venue is used by events and cannot be deleted.");

        _context.Venues.Remove(venue);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(Venue venue, SaveVenueDto dto)
    {
        venue.Name = dto.Name.Trim();
        venue.Location = dto.Location.Trim();
        venue.City = dto.City?.Trim();
        venue.Description = dto.Description?.Trim();
        venue.Capacity = dto.Capacity;
        venue.TimeZone = string.IsNullOrWhiteSpace(dto.TimeZone) ? null : dto.TimeZone.Trim();
    }

    private static bool IsValidTimeZone(string? id) =>
        string.IsNullOrWhiteSpace(id) || TimeZoneInfo.TryFindSystemTimeZoneById(id.Trim(), out _);
}
