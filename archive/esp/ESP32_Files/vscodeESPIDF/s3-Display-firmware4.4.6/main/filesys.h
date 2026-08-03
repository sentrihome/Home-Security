#ifndef FILESYS_H
#define FILESYS_H

#include "LittleFS.h"
#include "FS.h"

void littlefsinit(void);
void littlefsWriteFile(String filename, String content);
String littlefsReadFile(String filename);

#endif 

