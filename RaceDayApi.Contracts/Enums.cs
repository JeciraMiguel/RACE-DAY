using System.Text.Json.Serialization;

namespace RaceDayApi.Contracts;

// Serialized as strings in JSON for every consumer (API, MVC, tests)

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EventStatus { Draft, Published, Cancelled, Completed }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RegistrationStatus { Confirmed, Cancelled }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PaymentStatus { Pending, Paid, Waived }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ResultStatus { Finished, DNF, DNS, DSQ }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Gender { Male, Female, Other }
