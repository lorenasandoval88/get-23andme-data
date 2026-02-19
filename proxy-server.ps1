<#
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:3001/')
$listener.Start()
Write-Output 'PowerShell proxy running at http://localhost:3001'

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'

    if ($request.HttpMethod -eq 'OPTIONS') {
        $response.StatusCode = 204
        $response.Close()
        continue
    }

    if ($request.Url.AbsolutePath -ne '/pgp-stats') {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
        continue
    }

    try {
        $upstream = Invoke-WebRequest -Uri 'https://my.pgp-hms.org/public_genetic_data/statistics' -UseBasicParsing -TimeoutSec 30
        $body = [System.Text.Encoding]::UTF8.GetBytes($upstream.Content)
        $response.ContentType = 'text/html; charset=utf-8'
        $response.StatusCode = 200
        $response.OutputStream.Write($body, 0, $body.Length)
    } catch {
        $response.StatusCode = 502
        $err = [System.Text.Encoding]::UTF8.GetBytes("Proxy error: $($_.Exception.Message)")
        $response.OutputStream.Write($err, 0, $err.Length)
    } finally {
        $response.Close()
    }
}
#>
