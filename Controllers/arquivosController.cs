using MeuServidor.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace MeuServidor.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ArquivosController : ControllerBase
    {
        private readonly FileDbService _db;

        public ArquivosController(FileDbService db)
        {
            _db = db;
        }

        [HttpPost("create-folder")]
        public async Task<IActionResult> CreateFolder([FromBody] JsonElement body)
        {
            string? folderName = body.GetProperty("folder").GetString();
            if (string.IsNullOrEmpty(folderName))
                return BadRequest("Nome da pasta não informado");

            await _db.CreateFile(folderName, "__folder__");
            return Ok($"Pasta '{folderName}' criada com sucesso!");
        }

        [HttpPost("create-file")]
        public async Task<IActionResult> CreateFile([FromBody] JsonElement body)
        {
            string? fileName = body.GetProperty("file").GetString();
            var folderName = body.TryGetProperty("folder", out var f) ? f.GetString() ?? "." : ".";

            if (string.IsNullOrEmpty(fileName))
                return BadRequest("Nome do arquivo não informado");

            await _db.CreateFile(folderName, fileName);
            return Ok($"Arquivo '{fileName}.txt' criado em '{folderName}'");
        }

        [HttpPost("save-text")]
        public async Task<IActionResult> SaveText([FromBody] JsonElement body)
        {
            string? folderName = body.GetProperty("folder").GetString();
            string? fileName = body.GetProperty("file").GetString();
            string? content = body.GetProperty("content").GetString();

            if (string.IsNullOrEmpty(folderName) || string.IsNullOrEmpty(fileName) || string.IsNullOrEmpty(content))
                return BadRequest("Parâmetros faltando");

            await _db.SaveText(folderName, fileName, content);
            return Ok($"Arquivo '{fileName}.txt' salvo em '{folderName}'");
        }

        [HttpGet("read-file")]
        public async Task<IActionResult> ReadFile([FromQuery] string folder, [FromQuery] string file)
        {
            if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(file))
                return BadRequest("Parâmetros faltando");

            var content = await _db.ReadFile(folder, file);
            if (content == null)
                return NotFound($"Arquivo '{file}.txt' não encontrado em '{folder}'");

            return Ok(content);
        }

        [HttpGet("delete-folder")]
        public async Task<IActionResult> DeleteFolderGet([FromQuery] string folder)
        {
            if (string.IsNullOrEmpty(folder))
                return BadRequest("Nome da pasta não informado");

            var deleted = await _db.DeleteFolder(folder);
            if (!deleted)
                return NotFound($"Pasta '{folder}' não encontrada");

            return Ok($"Pasta '{folder}' apagada com sucesso!");
        }

        [HttpGet("delete-file")]
        public async Task<IActionResult> DeleteFileGet([FromQuery] string folder, [FromQuery] string file)
        {
            if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(file))
                return BadRequest("Parâmetros faltando");

            var deleted = await _db.DeleteFile(folder, file);
            if (!deleted)
                return NotFound($"Arquivo '{file}.txt' não encontrado em '{folder}'");

            return Ok($"Arquivo '{file}.txt' apagado de '{folder}'");
        }

        [HttpGet("list-folders")]
        public async Task<IActionResult> ListFolders()
        {
            var names = await _db.ListFolders();
            return Ok(names);
        }

        [HttpGet("list-files")]
        public async Task<IActionResult> ListFiles([FromQuery] string folder)
        {
            var names = await _db.ListFiles(folder ?? ".");
            return Ok(names);
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var data = await _db.ExportAll();
            return Ok(new { version = 1, exportedAt = DateTime.UtcNow.ToString("o"), data });
        }

        [HttpPost("import")]
        public async Task<IActionResult> Import([FromBody] JsonElement body)
        {
            if (!body.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return BadRequest("JSON inválido: propriedade 'data' não encontrada");

            var items = data.EnumerateArray().ToList();
            await _db.Import(items);
            return Ok("Dados importados com sucesso!");
        }

        [HttpPut("append-text")]
        public async Task<IActionResult> AppendText([FromBody] JsonElement body)
        {
            string? folderName = body.GetProperty("folder").GetString();
            string? fileName = body.GetProperty("file").GetString();
            string? content = body.GetProperty("content").GetString();

            if (string.IsNullOrEmpty(folderName) || string.IsNullOrEmpty(fileName) || string.IsNullOrEmpty(content))
                return BadRequest("Parâmetros 'folder', 'file' e 'content' são obrigatórios");

            await _db.AppendText(folderName, fileName, content);
            return Ok($"Conteúdo adicionado ao final de '{fileName}.txt' em '{folderName}'");
        }

        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return BadRequest("Parâmetro 'q' não informado");

            var results = await _db.Search(q);
            return Ok(results);
        }
    }
}
