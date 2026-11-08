using Microsoft.EntityFrameworkCore;
using RaceDayApi.Server.Data;
using RaceDayApi.Server.Models;

namespace RaceDayApi.Server.Services;

public class RankingService
{
    private readonly RaceDayDbContext _context;

    public RankingService(RaceDayDbContext context) => _context = context;

    /// <summary>
    /// Competition ranking within a category: equal finish times share a rank (1, 2, 2, 4).
    /// Only Finished results are ranked. Does not save; the caller saves.
    /// </summary>
    public async Task RecalculateAsync(int categoryId)
    {
        var results = await _context.TimingResults
            .Where(t => t.Registration!.CategoryId == categoryId)
            .ToListAsync();

        // SQLite cannot ORDER BY a TimeSpan, so sort in memory
        var finished = results
            .Where(t => t.Status == ResultStatus.Finished && t.FinishTime != null)
            .OrderBy(t => t.FinishTime)
            .ToList();

        foreach (var r in results.Except(finished)) r.OverallRank = null;

        for (int i = 0; i < finished.Count; i++)
        {
            finished[i].OverallRank = i > 0 && finished[i].FinishTime == finished[i - 1].FinishTime
                ? finished[i - 1].OverallRank
                : i + 1;
        }
    }
}
