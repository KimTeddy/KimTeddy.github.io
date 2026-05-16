$dir = 'C:\github\KimTeddy.github.io\assets\projects\drivers-license-test-simulation\images'
Get-ChildItem $dir | ForEach-Object {
    $name = $_.Name
    $newName = $name -replace '0. 초기 개발 모습_OpenGL 사용, 3D 그래픽 구현', 'initial-dev-opengl-3d' `
                     -replace 'PERI Board', 'peri-board' `
                     -replace 'TFT-LCD', 'tft-lcd' `
                     -replace 'flowchart-Accelerometer Thread', 'flowchart-accelerometer-thread' `
                     -replace 'flowchart-Button & LED Thread', 'flowchart-button-led-thread' `
                     -replace 'flowchart-Buzzer Thread', 'flowchart-buzzer-thread' `
                     -replace 'flowchart-FND Thread', 'flowchart-fnd-thread' `
                     -replace 'flowchart-Traffic Light Thread', 'flowchart-traffic-light-thread' `
                     -replace '작동-Accelerometer', 'operation-accelerometer' `
                     -replace '작동-FND-점수표시시스템', 'operation-fnd-score-system' `
                     -replace '작동-LCD Touch Screen \(bmp overlay\)', 'operation-lcd-touch-bmp-overlay' `
                     -replace '작동-RGBLED-신호등-빨간등', 'operation-rgbled-red-light' `
                     -replace '작동-RGBLED-신호등-주황등', 'operation-rgbled-orange-light' `
                     -replace '작동-RGBLED-신호등-초록불', 'operation-rgbled-green-light' `
                     -replace '작동-RGBLED-신호등', 'operation-rgbled-traffic-light' `
                     -replace '작동-TFT LCD\(bmp overlay\)', 'operation-tft-lcd-bmp-overlay' `
                     -replace '작동-TFT LCD\(bmp\+frame buffer\)', 'operation-tft-lcd-bmp-framebuffer' `
                     -replace '작동-방향지시등', 'operation-turn-signal' `
                     -replace '작동-버저', 'operation-buzzer' `
                     -replace '작동-버튼', 'operation-button' `
                     -replace '전체 모습', 'full-view' `
                     -replace ' ', '-'
    $newName = $newName.ToLower()
    if ($name -ne $newName) {
        Write-Host "Renaming $name to $newName"
        Rename-Item $_.FullName -NewName $newName
    }
}
