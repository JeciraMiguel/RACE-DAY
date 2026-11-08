# syntax=docker/dockerfile:1
# Builds the React app and the API into one image: the API serves the SPA from wwwroot.

FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# restore first so the layer is cached until a project file changes
COPY RaceDayApi.Contracts/RaceDayApi.Contracts.csproj RaceDayApi.Contracts/
COPY RaceDayApi.Server/RaceDayApi.Server.csproj RaceDayApi.Server/
RUN dotnet restore RaceDayApi.Server/RaceDayApi.Server.csproj
COPY RaceDayApi.Contracts/ RaceDayApi.Contracts/
COPY RaceDayApi.Server/ RaceDayApi.Server/
RUN dotnet publish RaceDayApi.Server/RaceDayApi.Server.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=frontend /src/frontend/dist ./wwwroot

# SQLite lives on a volume so data survives container replacement
RUN mkdir /data && chown $APP_UID /data
VOLUME /data

ENV ASPNETCORE_URLS=http://+:8080 \
    DisableHttpsRedirection=true \
    Health__Enabled=true \
    ConnectionStrings__DefaultConnection="Data Source=/data/raceday.db"

# Required at runtime (no defaults on purpose): Jwt__Key (32+ chars). Optional: Seed__AdminEmail,
# Seed__AdminPassword, AzureBlobStorage__ConnectionString, AzureBlobStorage__PublicBaseUrl.
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "RaceDayApi.Server.dll"]
