#include "keypad.h"

void keypadinit();
void keypadpress();

char keypadpassword[20];
String onetimepass;
int passwordcount = 0;
String setpassword = "23012003";

void keypadinit(){
    pinMode(18, OUTPUT);
    pinMode(19, OUTPUT);
    pinMode(21, OUTPUT);
    pinMode(22, OUTPUT);

    pinMode(23, INPUT_PULLDOWN);
    pinMode(25, INPUT_PULLDOWN);
    pinMode(26, INPUT_PULLDOWN);
    pinMode(27, INPUT_PULLDOWN);
}

void keypadpress(){
    digitalWrite(18, HIGH);
    delay(10);
    if ( digitalRead(23) == HIGH ){
        Serial.print("1");
        keypadpassword[passwordcount] = '1';
        passwordcount++;
        digitalWrite(18, LOW);
        delay(50);
    }
    if ( digitalRead(25) == HIGH ){
        Serial.print("2");
        keypadpassword[passwordcount] = '2';
        passwordcount++;
        digitalWrite(18, LOW);
        delay(50);
    }
    if ( digitalRead(26) == HIGH ){
        Serial.print("3");
        keypadpassword[passwordcount] = '3';
        passwordcount++;
        digitalWrite(18, LOW);
        delay(50);
    }
    if ( digitalRead(27) == HIGH ){
        Serial.print("A");
        keypadpassword[passwordcount] = 'A';
        passwordcount++;
        digitalWrite(18, LOW);
        delay(50);
    }
    digitalWrite(18, LOW);

    digitalWrite(19, HIGH);
    delay(10);
    if ( digitalRead(23) == HIGH ){
        Serial.print("4");
        keypadpassword[passwordcount] = '4';
        passwordcount++;
        digitalWrite(19, LOW);
        delay(50);
    }
    if ( digitalRead(25) == HIGH ){
        Serial.print("5");
        keypadpassword[passwordcount] = '5';
        passwordcount++;
        digitalWrite(19, LOW);
        delay(50);
    }
    if ( digitalRead(26) == HIGH ){
        Serial.print("6");
        keypadpassword[passwordcount] = '6';
        passwordcount++;
        digitalWrite(19, LOW);
        delay(50);
    }
    if ( digitalRead(27) == HIGH ){
        Serial.print("B");
        keypadpassword[passwordcount] = 'B';
        passwordcount++;
        digitalWrite(19, LOW);
        delay(50);
    }
    digitalWrite(19, LOW);

    digitalWrite(21, HIGH);
    delay(10);
    if ( digitalRead(23) == HIGH ){
        Serial.print("7");
        keypadpassword[passwordcount] = '7';
        passwordcount++;
        digitalWrite(21, LOW);
        delay(50);
    }
    if ( digitalRead(25) == HIGH ){
        Serial.print("8");
        keypadpassword[passwordcount] = '8';
        passwordcount++;
        digitalWrite(21, LOW);
        delay(50);
    }
    if ( digitalRead(26) == HIGH ){
        Serial.print("9");
        keypadpassword[passwordcount] = '9';
        passwordcount++;
        digitalWrite(21, LOW);
        delay(50);
    }
    if ( digitalRead(27) == HIGH ){
        Serial.print("C");
        keypadpassword[passwordcount] = 'C';
        passwordcount++;
        digitalWrite(21, LOW);
        delay(50);
    }
    digitalWrite(21, LOW);

    digitalWrite(22, HIGH);
    delay(10);
    if ( digitalRead(23) == HIGH ){
        Serial.print("*");
        keypadpassword[passwordcount] = '*';
        passwordcount++;
        digitalWrite(22, LOW);
        delay(50);
    }
    if ( digitalRead(25) == HIGH ){
        Serial.print("0");
        keypadpassword[passwordcount] = '0';
        passwordcount++;
        digitalWrite(22, LOW);
        delay(50);
    }
    if ( digitalRead(26) == HIGH ){
        Serial.print("#");
        keypadpassword[passwordcount] = '#';
        passwordcount++;
        digitalWrite(22, LOW);
        delay(50);
    }
    if ( digitalRead(27) == HIGH ){
        Serial.print("D");
        keypadpassword[passwordcount] = 'D';
        passwordcount++;
        digitalWrite(22, LOW);
        delay(50);
    }
    digitalWrite(22, LOW);

    if (passwordcount == 8) {
        keypadpassword[8] = '\0';
        if (strncmp(keypadpassword, setpassword.c_str(), strlen(keypadpassword)) == 0 && motiononflag == 1){
            Serial.println("approved 5s cooldown");
            motiononflag = 0;
            delay(5000);
            motiononflag = 1;
        }
        else if (strncmp(keypadpassword, setpassword.c_str(), strlen(keypadpassword)) == 0){
            Serial.println("approved");
        }
        else if ( onetimepass == keypadpassword && motiononflag == 1 ){
            Serial.println("approved via otp 5s cooldown");
            onetimepass = "GGGGGGGGG";
            motiononflag = 0;
            delay(5000);
            motiononflag = 1;
        }
        else if ( onetimepass == keypadpassword ){
            Serial.println("approved via otp");
            onetimepass = "GGGGGGGGG";
        }
        else {
            Serial.println("nope ");
        }
        passwordcount = 0;
    }
}