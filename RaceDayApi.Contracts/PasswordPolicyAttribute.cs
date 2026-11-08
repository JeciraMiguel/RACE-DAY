using System.ComponentModel.DataAnnotations;

namespace RaceDayApi.Contracts;

/// <summary>Requires at least one letter and one digit (length is validated separately).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class PasswordPolicyAttribute : ValidationAttribute
{
    public PasswordPolicyAttribute() : base("Password must contain at least one letter and one digit.") { }

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string password) return ValidationResult.Success; // [Required] covers null
        return password.Any(char.IsLetter) && password.Any(char.IsDigit)
            ? ValidationResult.Success
            : new ValidationResult(ErrorMessage);
    }
}
