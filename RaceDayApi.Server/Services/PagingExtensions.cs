using Microsoft.EntityFrameworkCore;

namespace RaceDayApi.Server.Services;

public static class PagingExtensions
{
    public const int MaxPageSize = 100;

    /// <summary>Counts, then fetches one page. The query must already be ordered.</summary>
    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> orderedQuery, int page, int pageSize)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var total = await orderedQuery.CountAsync();
        var items = await orderedQuery.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return new PagedResult<T>(items, page, pageSize, total);
    }
}
