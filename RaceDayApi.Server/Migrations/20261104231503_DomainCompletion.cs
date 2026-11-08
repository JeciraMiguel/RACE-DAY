using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RaceDayApi.Server.Migrations
{
    /// <inheritdoc />
    public partial class DomainCompletion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Venues",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Venues",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DateOfBirth",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmergencyContactName",
                table: "Users",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmergencyContactPhone",
                table: "Users",
                type: "TEXT",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Gender",
                table: "Users",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "Users",
                type: "TEXT",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AlterColumn<TimeSpan>(
                name: "FinishTime",
                table: "TimingResults",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(TimeSpan),
                oldType: "TEXT");

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "TimingResults",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Finished");

            migrationBuilder.AddColumn<DateTime>(
                name: "CancelledAt",
                table: "Registrations",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EventId",
                table: "Registrations",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Backfill rows created before this migration: derive the event from the category
            // and give each registration a unique race number within its event.
            migrationBuilder.Sql(
                "UPDATE Registrations SET EventId = (SELECT c.EventId FROM Categories c WHERE c.CategoryId = Registrations.CategoryId);");
            migrationBuilder.Sql(
                "UPDATE Registrations SET RaceNumber = (SELECT COUNT(*) FROM Registrations r2 " +
                "WHERE r2.EventId = Registrations.EventId AND r2.RegistrationId <= Registrations.RegistrationId);");

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                table: "Registrations",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Pending");

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Registrations",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Confirmed");

            migrationBuilder.AddColumn<int>(
                name: "OrganizerId",
                table: "Events",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RegistrationClosesAt",
                table: "Events",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RegistrationOpensAt",
                table: "Events",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Events",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Published");

            migrationBuilder.AddColumn<decimal>(
                name: "DistanceKm",
                table: "Categories",
                type: "decimal(8,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Gender",
                table: "Categories",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxAge",
                table: "Categories",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxParticipants",
                table: "Categories",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinAge",
                table: "Categories",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<TimeSpan>(
                name: "StartTime",
                table: "Categories",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Registrations_EventId_RaceNumber",
                table: "Registrations",
                columns: new[] { "EventId", "RaceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_OrganizerId",
                table: "Events",
                column: "OrganizerId");

            migrationBuilder.AddForeignKey(
                name: "FK_Events_Users_OrganizerId",
                table: "Events",
                column: "OrganizerId",
                principalTable: "Users",
                principalColumn: "UserId",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Registrations_Events_EventId",
                table: "Registrations",
                column: "EventId",
                principalTable: "Events",
                principalColumn: "EventId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Events_Users_OrganizerId",
                table: "Events");

            migrationBuilder.DropForeignKey(
                name: "FK_Registrations_Events_EventId",
                table: "Registrations");

            migrationBuilder.DropIndex(
                name: "IX_Registrations_EventId_RaceNumber",
                table: "Registrations");

            migrationBuilder.DropIndex(
                name: "IX_Events_OrganizerId",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Venues");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Venues");

            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EmergencyContactName",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EmergencyContactPhone",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Gender",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "TimingResults");

            migrationBuilder.DropColumn(
                name: "CancelledAt",
                table: "Registrations");

            migrationBuilder.DropColumn(
                name: "EventId",
                table: "Registrations");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                table: "Registrations");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Registrations");

            migrationBuilder.DropColumn(
                name: "OrganizerId",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RegistrationClosesAt",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RegistrationOpensAt",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "DistanceKm",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "Gender",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "MaxAge",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "MaxParticipants",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "MinAge",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "StartTime",
                table: "Categories");

            migrationBuilder.AlterColumn<TimeSpan>(
                name: "FinishTime",
                table: "TimingResults",
                type: "TEXT",
                nullable: false,
                defaultValue: new TimeSpan(0, 0, 0, 0, 0),
                oldClrType: typeof(TimeSpan),
                oldType: "TEXT",
                oldNullable: true);
        }
    }
}
