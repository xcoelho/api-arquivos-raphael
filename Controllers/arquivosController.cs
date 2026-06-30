using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace MeuServidor.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ArquivosController : ControllerBase
    {
        // https://github.com/xcoelho/api-arquivos-raphael
        // https://dashboard.render.com/web/srv-d90cso37uimc73999ut0/deploys/dep-d90d7gjtqb8s73fn1o2g?r=2026-06-28%4007%3A55%3A50%7E2026-06-28%4007%3A59%3A19
        // site server:    https://api-arquivos-raphael.onrender.com

        // criar pasta:    POST https://api-arquivos-raphael.onrender.com/arquivos/create-folder { "folder": "teste" }
        // criar arquivo:  POST https://api-arquivos-raphael.onrender.com/arquivos/create-file   { "folder": "teste", "file": "arquivoTeste" }
        // add dados:      POST https://api-arquivos-raphael.onrender.com/arquivos/save-text { "folder": "teste", "file": "arquivoTeste", "content": "qualquer texto ou JSON aqui" }
        // ler dados:      GET https://api-arquivos-raphael.onrender.com/arquivos/read-file?folder=teste&file=arquivoTeste
        // apagar pasta:   https://api-arquivos-raphael.onrender.com/arquivos/delete-folder?folder=teste
        // apagar arquivo: https://api-arquivos-raphael.onrender.com/arquivos/delete-file?folder=teste&file=arquivoTeste

        [HttpPost("create-folder")]
        public IActionResult CreateFolder([FromBody] JsonElement body)
        {
            string? folderName = body.GetProperty("folder").GetString();
            if (string.IsNullOrEmpty(folderName))
                return BadRequest("Nome da pasta não informado");

            Directory.CreateDirectory(folderName);
            return Ok($"Pasta '{folderName}' criada com sucesso!");
        }

        [HttpPost("create-file")]
        public IActionResult CreateFile([FromBody] JsonElement body)
        {
            string? fileName = body.GetProperty("file").GetString();
            string? folderName = body.TryGetProperty("folder", out var f) ? f.GetString() : ".";

            if (string.IsNullOrEmpty(fileName))
                return BadRequest("Nome do arquivo não informado");

            Directory.CreateDirectory(folderName);
            string filePath = Path.Combine(folderName, $"{fileName}.txt");

            if (!System.IO.File.Exists(filePath))
                System.IO.File.WriteAllText(filePath, string.Empty);

            return Ok($"Arquivo '{fileName}.txt' criado em '{folderName}'");
        }

        [HttpPost("save-text")]
        public IActionResult SaveText([FromBody] JsonElement body)
        {
            string? folderName = body.GetProperty("folder").GetString();
            string? fileName = body.GetProperty("file").GetString();
            string? content = body.GetProperty("content").GetString();

            if (string.IsNullOrEmpty(folderName) || string.IsNullOrEmpty(fileName) || string.IsNullOrEmpty(content))
                return BadRequest("Parâmetros faltando");

            Directory.CreateDirectory(folderName);
            string filePath = Path.Combine(folderName, $"{fileName}.txt");

            System.IO.File.WriteAllText(filePath, content);

            return Ok($"Arquivo '{fileName}.txt' salvo em '{folderName}'");
        }

        [HttpGet("read-file")]
        public IActionResult ReadFile([FromQuery] string folder, [FromQuery] string file)
        {
            if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(file))
                return BadRequest("Parâmetros faltando");

            string filePath = Path.Combine(folder, $"{file}.txt");

            if (!System.IO.File.Exists(filePath))
                return NotFound($"Arquivo '{file}.txt' não encontrado em '{folder}'");

            string content = System.IO.File.ReadAllText(filePath);

            return Ok(content);
        }

        [HttpGet("delete-folder")]
        public IActionResult DeleteFolderGet([FromQuery] string folder)
        {
            if (string.IsNullOrEmpty(folder))
                return BadRequest("Nome da pasta não informado");

            if (!Directory.Exists(folder))
                return NotFound($"Pasta '{folder}' não encontrada");

            Directory.Delete(folder, true); // true = apaga recursivamente
            return Ok($"Pasta '{folder}' apagada com sucesso!");
        }

        [HttpGet("delete-file")]
        public IActionResult DeleteFileGet([FromQuery] string folder, [FromQuery] string file)
        {
            if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(file))
                return BadRequest("Parâmetros faltando");

            string filePath = Path.Combine(folder, $"{file}.txt");

            if (!System.IO.File.Exists(filePath))
                return NotFound($"Arquivo '{file}.txt' não encontrado em '{folder}'");

            System.IO.File.Delete(filePath);
            return Ok($"Arquivo '{file}.txt' apagado de '{folder}'");
        }

        [HttpGet("list-folders")]
        public IActionResult ListFolders()
        {
            var dirs = Directory.GetDirectories(".");
            var names = dirs.Select(Path.GetFileName);
            return Ok(names);
        }

        [HttpGet("list-files")]
        public IActionResult ListFiles([FromQuery] string folder)
        {
            var dir = folder ?? ".";
            var files = Directory.GetFiles(dir, "*.txt");
            var names = files.Select(Path.GetFileName);
            return Ok(names);
        }

        [HttpGet("export")]
        public IActionResult Export()
        {
            var dirs = Directory.GetDirectories(".");
            var data = new List<object>();

            foreach (var dir in dirs)
            {
                var folderName = Path.GetFileName(dir);
                var fileNames = Directory.GetFiles(dir, "*.txt").Select(Path.GetFileNameWithoutExtension);
                var files = new List<object>();

                foreach (var fileName in fileNames)
                {
                    if (fileName == null) continue;
                    var content = System.IO.File.ReadAllText(Path.Combine(dir, $"{fileName}.txt"));
                    files.Add(new { name = fileName, content });
                }

                data.Add(new { folder = folderName, files });
            }

            return Ok(new { version = 1, exportedAt = DateTime.UtcNow.ToString("o"), data });
        }

        [HttpPost("import")]
        public IActionResult Import([FromBody] JsonElement body)
        {
            if (!body.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return BadRequest("JSON inválido: propriedade 'data' não encontrada");

            var rootDirs = Directory.GetDirectories(".");
            foreach (var dir in rootDirs)
                Directory.Delete(dir, true);

            foreach (var item in data.EnumerateArray())
            {
                if (!item.TryGetProperty("folder", out var folderEl) || folderEl.GetString() is not string folderName)
                    continue;

                var files = item.TryGetProperty("files", out var filesEl) && filesEl.ValueKind == JsonValueKind.Array
                    ? filesEl.EnumerateArray().ToList()
                    : new List<JsonElement>();

                foreach (var file in files)
                {
                    var fileName = file.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var content = file.TryGetProperty("content", out var c) ? c.GetString() : "";

                    if (string.IsNullOrEmpty(fileName)) continue;

                    Directory.CreateDirectory(folderName);
                    System.IO.File.WriteAllText(Path.Combine(folderName, $"{fileName}.txt"), content ?? "");
                }

                if (files.Count == 0)
                    Directory.CreateDirectory(folderName);
            }

            return Ok("Dados importados com sucesso!");
        }
    }
}
