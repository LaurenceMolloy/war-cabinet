import os
import io
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# This scope allows access ONLY to the hidden appData folder
SCOPES = ['https://www.googleapis.com/auth/drive.appdata']

def main():
    creds = None
    # Token file stores your login session after the first run
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                print("\n❌ ERROR: credentials.json not found!")
                print("Follow the steps in recover_backups_guide.md to download your keys from the GCloud Console.")
                return
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    service = build('drive', 'v3', credentials=creds)

    print("\n🛰️ Scanning hidden AppData sectors...")
    results = service.files().list(
        spaces='appDataFolder',
        fields="files(id, name, createdTime, appProperties)",
        pageSize=50
    ).execute()
    items = results.get('files', [])

    if not items:
        print('📭 No backups found in the cloud.')
        return

    print(f'📦 Found {len(items)} backups. Starting extraction...')
    output_dir = 'recovered_backups'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for item in items:
        # Include summary from appProperties if available
        summary = item.get('appProperties', {}).get('summary', 'No summary')
        print(f"⬇️ Downloading: {item['name']} [{summary}]...")
        
        request = service.files().get_media(fileId=item['id'])
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            
        with open(os.path.join(output_dir, item['name']), 'wb') as f:
            f.write(fh.getvalue())
            
    print(f"\n✅ Extraction complete. {len(items)} snapshots saved to: {os.path.abspath(output_dir)}")

if __name__ == '__main__':
    main()
