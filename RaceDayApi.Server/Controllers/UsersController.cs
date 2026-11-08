using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;
using RaceDayApi.Server.Services;

namespace RaceDayApi.Server.Controllers;

[Route("api/[controller]")]
[Authorize(Policy = Policies.AdminOnly)]
public class UsersController : ApiControllerBase
{
    private static readonly string[] ValidRoles = [Roles.Participant, Roles.Organizer, Roles.Admin];

    private readonly RaceDayDbContext _context;
    private readonly TokenService _tokens;

    public UsersController(RaceDayDbContext context, TokenService tokens)
    {
        _context = context;
        _tokens = tokens;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<UserSummaryDto>>> GetUsers(
        [FromQuery] string? search, [FromQuery] string? role, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var query = _context.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(role)) query = query.Where(u => u.Role == role);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{search.Trim()}%";
            query = query.Where(u => EF.Functions.Like(u.FullName, pattern) || EF.Functions.Like(u.Email, pattern));
        }

        var paged = await query
            .OrderBy(u => u.FullName).ThenBy(u => u.UserId)
            .Select(u => new UserSummaryDto(u.UserId, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAt))
            .ToPagedAsync(page, pageSize);

        return Ok(paged);
    }

    /// <summary>Changes a user's role. Takes effect immediately: the user's tokens are invalidated.</summary>
    [HttpPut("{id:int}/role")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleDto dto)
    {
        if (!ValidRoles.Contains(dto.Role))
            return Error(400, $"Role must be one of: {string.Join(", ", ValidRoles)}.");
        if (id == User.GetUserId())
            return Error(409, "You cannot change your own role.");

        var user = await _context.Users.FindAsync(id);
        if (user == null) return Error(404, $"User {id} not found.");

        if (user.Role != dto.Role)
        {
            user.Role = dto.Role;
            user.TokenVersion++;
            await _context.SaveChangesAsync();
            await _tokens.RevokeAllAsync(id);
        }

        return NoContent();
    }

    /// <summary>Activates or deactivates an account. Deactivation signs the user out immediately.</summary>
    [HttpPut("{id:int}/active")]
    public async Task<IActionResult> UpdateActive(int id, [FromBody] UpdateActiveDto dto)
    {
        if (id == User.GetUserId())
            return Error(409, "You cannot change the status of your own account.");

        var user = await _context.Users.FindAsync(id);
        if (user == null) return Error(404, $"User {id} not found.");

        if (user.IsActive != dto.IsActive)
        {
            user.IsActive = dto.IsActive;
            user.TokenVersion++;
            await _context.SaveChangesAsync();
            if (!dto.IsActive) await _tokens.RevokeAllAsync(id);
        }

        return NoContent();
    }
}
