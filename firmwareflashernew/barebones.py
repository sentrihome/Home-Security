import time
import os
import requests
import secrets
import string

print("Welcome")
time.sleep(5)

while True:
    os.system("clear")
    choice = int(input("\r1. Setup New Device\n" \
                    "2. Setup New Module\n" \
                    "3. Update Firmware\n"))

    if choice == 1:
        os.system("clear")
        print("Connect to wifi ssid and pass", end="", flush=True)
        reply = input("\nConnected? y/n: ")
        if reply == "y":
            print("Ok, proceeding")
            homewifissid = input("\nEnter Home Wifi SSID: ")
            homewifipass = input("\nEnter Home Wifi Password: ")
            disarmpass = input("\nEnter Disarm Pass: ")
            chars = string.ascii_letters + string.digits
            encryptedpass = ''.join(secrets.choice(chars) for _ in range(10))
            print(encryptedpass)
            print(f"SSID={homewifissid}&pass={homewifipass}&disarmpass={disarmpass}")
            resp = requests.post("http://192.168.10.1/api/setup", 
                                 data= f"SSID={homewifissid}&pass={homewifipass}&disarmpass={disarmpass}", 
                                 headers={"Content-Type": "application/x-www-form-urlencoded"},
                                 timeout=10,
            )
            print(resp.status_code, resp.text)
            time.sleep(3)
    