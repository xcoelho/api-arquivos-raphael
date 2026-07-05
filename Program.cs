using MeuServidor.Services;
using Microsoft.OpenApi.Models;
using MongoDB.Driver;


var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Servidor de Arquivos",
        Version = "v1"
    });
});

var mongoUri = Environment.GetEnvironmentVariable("MONGODB_URI")
    ?? builder.Configuration.GetConnectionString("MongoDB")
    ?? "mongodb://localhost:27017";
var mongoDbName = Environment.GetEnvironmentVariable("MONGODB_DATABASE") ?? "webServerText";
builder.Services.AddSingleton<IMongoClient>(new MongoClient(mongoUri));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(mongoDbName));
builder.Services.AddScoped<FileDbService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("index.html");

app.Run();
