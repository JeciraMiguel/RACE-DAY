namespace RaceDayApi.Server.Services;

public static class ImageValidator
{
    public const long MaxBytes = 5 * 1024 * 1024;
    private static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

    /// <summary>Returns an error message, or null when the file is absent or acceptable.</summary>
    public static string? Validate(IFormFile? file)
    {
        if (file == null || file.Length == 0) return null;
        if (file.Length > MaxBytes) return "Image must be 5 MB or smaller.";

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension)) return "Unsupported image type.";
        if (file.ContentType == null || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return "File must be an image.";

        return null;
    }
}
