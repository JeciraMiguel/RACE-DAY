using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RaceDayApi.Server.Authorization;
using RaceDayApi.Server.Models;

namespace RaceDayApi.Server.Controllers;

/// <summary>Base class for API controllers: one consistent error shape (RFC 9457 ProblemDetails).</summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    /// <summary>
    /// Builds a ProblemDetails response without needing DI, so controllers stay unit-testable.
    /// The human-readable message is in <c>detail</c>.
    /// </summary>
    protected ObjectResult Error(int statusCode, string message)
    {
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = ReasonPhrase(statusCode),
            Detail = message
        };
        return new ObjectResult(problem)
        {
            StatusCode = statusCode,
            ContentTypes = { "application/problem+json" }
        };
    }

    /// <summary>Resource-based authorization: admins, or the organizer who owns the event.</summary>
    protected async Task<bool> CanManageAsync(Event raceEvent)
    {
        var authorization = HttpContext.RequestServices.GetRequiredService<IAuthorizationService>();
        return (await authorization.AuthorizeAsync(User, raceEvent, Policies.EventOwner)).Succeeded;
    }

    private static string ReasonPhrase(int statusCode) => statusCode switch
    {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        423 => "Locked",
        429 => "Too Many Requests",
        _ => "Error"
    };
}
