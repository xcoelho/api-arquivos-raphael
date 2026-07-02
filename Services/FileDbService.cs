using System.Text.Json;
using MeuServidor.Models;
using MongoDB.Driver;

namespace MeuServidor.Services;

public class FileDbService
{
    private readonly IMongoCollection<FileDocument> _files;

    public FileDbService(IMongoDatabase database)
    {
        _files = database.GetCollection<FileDocument>("files");
    }

    public async Task CreateFile(string folder, string fileName)
    {
        var existing = await _files.Find(f => f.Folder == folder && f.FileName == fileName).FirstOrDefaultAsync();
        if (existing == null)
        {
            await _files.InsertOneAsync(new FileDocument
            {
                Folder = folder,
                FileName = fileName,
                Content = ""
            });
        }
    }

    public async Task SaveText(string folder, string fileName, string content)
    {
        var filter = Builders<FileDocument>.Filter.Where(f => f.Folder == folder && f.FileName == fileName);
        var update = Builders<FileDocument>.Update.Set(f => f.Content, content);
        var result = await _files.UpdateOneAsync(filter, update);
        if (result.MatchedCount == 0)
        {
            await _files.InsertOneAsync(new FileDocument
            {
                Folder = folder,
                FileName = fileName,
                Content = content
            });
        }
    }

    public async Task<string?> ReadFile(string folder, string fileName)
    {
        var doc = await _files.Find(f => f.Folder == folder && f.FileName == fileName).FirstOrDefaultAsync();
        return doc?.Content;
    }

    public async Task<bool> DeleteFolder(string folder)
    {
        var result = await _files.DeleteManyAsync(f => f.Folder == folder);
        return result.DeletedCount > 0;
    }

    public async Task<bool> DeleteFile(string folder, string fileName)
    {
        var result = await _files.DeleteOneAsync(f => f.Folder == folder && f.FileName == fileName);
        return result.DeletedCount > 0;
    }

    public async Task<List<string>> ListFolders()
    {
        var folders = await _files.Distinct(f => f.Folder, FilterDefinition<FileDocument>.Empty).ToListAsync();
        return folders.Where(f => !string.IsNullOrEmpty(f) && f != ".").ToList();
    }

    public async Task<List<string>> ListFiles(string folder)
    {
        var docs = await _files.Find(f => f.Folder == folder && f.FileName != "__folder__" && f.FileName != "__empty__").ToListAsync();
        return docs.Select(d => d.FileName + ".txt").ToList();
    }

    public async Task<List<object>> ExportAll()
    {
        var all = await _files.Find(FilterDefinition<FileDocument>.Empty).ToListAsync();
        var grouped = all.GroupBy(f => f.Folder);

        var data = new List<object>();
        foreach (var group in grouped)
        {
            var files = group
                .Where(f => f.FileName != "__folder__" && f.FileName != "__empty__")
                .Select(f => new
                {
                    name = f.FileName,
                    content = f.Content
                }).ToList<object>();
            data.Add(new { folder = group.Key, files });
        }
        return data;
    }

    public async Task Import(List<JsonElement> data)
    {
        await _files.DeleteManyAsync(FilterDefinition<FileDocument>.Empty);
        var docs = new List<FileDocument>();
        foreach (var item in data)
        {
            var folderName = item.TryGetProperty("folder", out var f) ? f.GetString() : null;
            if (string.IsNullOrEmpty(folderName)) continue;

            var files = item.TryGetProperty("files", out var filesEl) && filesEl.ValueKind == JsonValueKind.Array
                ? filesEl.EnumerateArray().ToList()
                : new List<JsonElement>();

            foreach (var file in files)
            {
                var fileName = file.TryGetProperty("name", out var n) ? n.GetString() : null;
                var content = file.TryGetProperty("content", out var c) ? c.GetString() : "";
                if (string.IsNullOrEmpty(fileName)) continue;
                docs.Add(new FileDocument
                {
                    Folder = folderName,
                    FileName = fileName,
                    Content = content ?? ""
                });
            }

            if (files.Count == 0)
            {
                docs.Add(new FileDocument
                {
                    Folder = folderName,
                    FileName = "__empty__",
                    Content = ""
                });
            }
        }
        if (docs.Count > 0)
            await _files.InsertManyAsync(docs);
    }

    public async Task AppendText(string folder, string fileName, string content)
    {
        var filter = Builders<FileDocument>.Filter.Where(f => f.Folder == folder && f.FileName == fileName);
        var existing = await _files.Find(filter).FirstOrDefaultAsync();
        if (existing != null)
        {
            await _files.UpdateOneAsync(filter,
                Builders<FileDocument>.Update.Set(f => f.Content, existing.Content + content));
        }
        else
        {
            await _files.InsertOneAsync(new FileDocument
            {
                Folder = folder,
                FileName = fileName,
                Content = content
            });
        }
    }

    public async Task<List<object>> Search(string query)
    {
        var lowerQuery = query.ToLowerInvariant();
        var all = await _files.Find(f => f.FileName != "__folder__" && f.FileName != "__empty__").ToListAsync();
        var results = new List<object>();
        foreach (var doc in all)
        {
            var lowerContent = doc.Content.ToLowerInvariant();
            var idx = lowerContent.IndexOf(lowerQuery, StringComparison.Ordinal);
            if (idx < 0) continue;

            var start = Math.Max(0, idx - 40);
            var end = Math.Min(doc.Content.Length, idx + query.Length + 40);
            var preview = (start > 0 ? "..." : "") +
                          doc.Content.Substring(start, end - start).Replace("\r", "").Replace("\n", " ") +
                          (end < doc.Content.Length ? "..." : "");

            results.Add(new { folder = doc.Folder, file = doc.FileName, preview });
        }
        return results;
    }
}
