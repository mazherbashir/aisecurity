$body = @{
    model = "llama3.2:3b"
    messages = @(
        @{
            role = "user"
            content = "Hello!"
        }
    )
} | ConvertTo-Json -Depth 10 -Compress

Invoke-RestMethod -Uri "http://localhost:11434/api/chat" -Method Post -Body $body -ContentType "application/json"