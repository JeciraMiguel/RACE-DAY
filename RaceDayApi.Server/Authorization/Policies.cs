using Microsoft.AspNetCore.Authorization;
using RaceDayApi.Server.Models;
using RaceDayApi.Server.Services;

namespace RaceDayApi.Server.Authorization;

public static class Policies
{
    public const string AdminOnly = "AdminOnly";
    public const string CanManageEvents = "CanManageEvents";
    public const string CanRecordResults = "CanRecordResults";

    /// <summary>Resource-based: the resource is an <see cref="Event"/>.</summary>
    public const string EventOwner = "EventOwner";

    public static void Configure(AuthorizationOptions options)
    {
        options.AddPolicy(AdminOnly, p => p.RequireRole(Roles.Admin));
        options.AddPolicy(CanManageEvents, p => p.RequireRole(Roles.Admin, Roles.Organizer));
        options.AddPolicy(CanRecordResults, p => p.RequireRole(Roles.Admin, Roles.Organizer));
        options.AddPolicy(EventOwner, p => p.AddRequirements(new EventOwnerRequirement()));
    }
}

public class EventOwnerRequirement : IAuthorizationRequirement { }

/// <summary>Admins manage every event; organizers only the events they own.</summary>
public class EventOwnerHandler : AuthorizationHandler<EventOwnerRequirement, Event>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, EventOwnerRequirement requirement, Event resource)
    {
        if (context.User.CanManage(resource)) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
