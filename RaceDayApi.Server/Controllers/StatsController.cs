using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Contracts;

namespace RaceDayApi.Server.Controllers;

[Route("api/[controller]")]
[Authorize(Policy = Policies.AdminOnly)]
public class StatsController : ApiControllerBase
{
    private readonly RaceDayDbContext _context;

    public StatsController(RaceDayDbContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<StatsDto>> GetStats()
    {
        var byStatus = await _context.Events
            .GroupBy(e => e.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        // Every status is reported, even when its count is zero
        var events = Enum.GetValues<EventStatus>()
            .ToDictionary(s => s.ToString(), s => byStatus.FirstOrDefault(x => x.Status == s)?.Count ?? 0);

        return Ok(new StatsDto(
            events,
            await _context.Users.CountAsync(),
            await _context.Registrations.CountAsync(r => r.Status == RegistrationStatus.Confirmed),
            await _context.TimingResults.CountAsync()));
    }
}
