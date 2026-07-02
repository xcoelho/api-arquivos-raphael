using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace MeuServidor.Models;

public class FileDocument
{
    [BsonId]
    public ObjectId Id { get; set; }
    public string Folder { get; set; } = "";
    public string FileName { get; set; } = "";
    public string Content { get; set; } = "";
}
