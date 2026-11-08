using System.Security.Claims;
using RaceDayApi.Server.Models;

namespace RaceDayApi.Server.Services;

public static class UserExtensions
{
    public static int? GetUserId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public static bool IsAdmin(this ClaimsPrincipal user) => user.IsInRole(Roles.Admin);

    public static bool IsOrganizer(this ClaimsPrincipal user) => user.IsInRole(Roles.Organizer);

    /// <summary>Admins manage everything; organizers only the events they own.</summary>
    public static bool CanManage(this ClaimsPrincipal user, Event raceEvent)
    {
        if (user.IsAdmin()) return true;
        var id = user.GetUserId();
        return user.IsOrganizer() && id != null && raceEvent.OrganizerId == id;
    }

    /// <summary>Drafts are visible only to their owner and admins.</summary>
    public static IQueryable<Event> VisibleTo(this IQueryable<Event> events, ClaimsPrincipal user)
    {
        if (user.IsAdmin()) return events;
        var id = user.GetUserId();
        if (user.IsOrganizer() && id != null)
        {
            var uid = id.Value;
            return events.Where(e => e.Status != EventStatus.Draft || e.OrganizerId == uid);
        }
        return events.Where(e => e.Status != EventStatus.Draft);
    }
}
