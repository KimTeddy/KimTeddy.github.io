import re

with open('assets/css/project-detail.css', 'r', encoding='utf-8') as f:
    css = f.read()

css = css.replace('.armi-', '.project-')

with open('assets/css/project-detail.css', 'w', encoding='utf-8') as f:
    f.write(css)

with open('armi.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('assets/projects/armi/armi.css', 'assets/css/project-detail.css')
html = html.replace('class="armi-', 'class="project-')
html = html.replace(' class="armi-', ' class="project-')
html = html.replace(' armi-', ' project-')

# Remove real names
html = html.replace('<div class="project-member__name">ㅇㅇㅇ</div>', '<div class="project-member__name">KimTeddy</div>')
html = html.replace('<div class="project-member__name">ㅇㅇㅇ</div>', '<div class="project-member__name">MoonScott</div>')
html = html.replace('<div class="project-member__name">ㅇㅇㅇ</div>', '<div class="project-member__name">iamgodjinsu</div>')
html = html.replace('<div class="project-member__name">ㅇㅇㅇ</div>', '<div class="project-member__name">minjoll</div>')
html = html.replace('<div class="project-member__name">ㅇㅇㅇ</div>', '<div class="project-member__name">jungminhye</div>')

with open('armi.html', 'w', encoding='utf-8') as f:
    f.write(html)
