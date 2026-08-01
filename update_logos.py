import os
import glob

# All frontend files now live inside the frontend/ folder
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(SCRIPT_DIR, 'frontend')

# Add favicon to all html files
html_files = glob.glob(os.path.join(FRONTEND_DIR, '*.html'))
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if '<link rel="icon"' not in content:
        # Find </head> and insert just before it
        content = content.replace('</head>', '    <link rel="icon" type="image/svg+xml" href="logo.svg">\n</head>')
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated favicon in {file}")

# Update logo references in app.js
app_js_path = os.path.join(FRONTEND_DIR, 'app.js')
with open(app_js_path, 'r', encoding='utf-8') as f:
    app_js = f.read()

app_js = app_js.replace('<div class="logo-dot"></div>', '<img src="logo.svg" alt="Logo" class="logo-img">')
with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_js)
print("Updated logo in app.js")

# Update logo references in login.html and register.html
for file in ['login.html', 'register.html', 'index.html']:
    file_path = os.path.join(FRONTEND_DIR, file)
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        content = content.replace('<div class="logo-dot"></div>', '<img src="logo.svg" alt="Logo" class="logo-img">')
        content = content.replace('<div class="dot"></div>', '<img src="logo.svg" alt="Logo" class="logo-img">')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated logo in {file}")

