#include "jsonhandler.h"
#include "cJSON.h"

std::string jsonparser(const char *json_str, const char *key)
{
    cJSON *root = cJSON_Parse(json_str);
    if (root == NULL)
        return "";

    cJSON *item = cJSON_GetObjectItem(root, key);
    if (cJSON_IsString(item)) {
        // printf("%s\n", item->valuestring);
        std::string result = item->valuestring;
        cJSON_Delete(root);
        return result;
    }

    cJSON_Delete(root);
    return "";
}
