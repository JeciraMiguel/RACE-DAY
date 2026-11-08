using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RaceDayApi.Server.Models;

public class TimingResult
{
    [Key]
    public int TimingResultId { get; set; }

    [Required]
    public int RegistrationId { get; set; }

    [ForeignKey(nameof(RegistrationId))]
    public Registration? Registration { get; set; }

    public ResultStatus Status { get; set; } = ResultStatus.Finished;

    /// <summary>Required when <see cref="Status"/> is Finished, null otherwise.</summary>
    public TimeSpan? FinishTime { get; set; }

    /// <summary>Rank within the registration's category; only Finished results are ranked.</summary>

    public int? OverallRank { get; set; }

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}