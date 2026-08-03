For build errors

General Troubleshooting:

on esp-idf terminal run:
    rm -rf managed_components
    idf.py fullclean

    idf.py reconfigure

    idf.py menuconfig and enable arduino

edit sdk config:
    CONFIG_FREERTOS_HZ=100

    to

    CONFIG_FREERTOS_HZ=1000

go to esp-idf terminal again and run:
    idf.py menuconfig

and fix log wrapper to using external log wrapper


