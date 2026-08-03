cmake_minimum_required(VERSION 3.10.0)
project(firmwareflasher VERSION 0.1.0 LANGUAGES C CXX)

add_executable(firmwareflasher main.cpp)

add_subdirectory(thirdparty/FTXUI)

target_link_libraries(firmwareflasher
  PRIVATE ftxui::screen
  PRIVATE ftxui::dom
  PRIVATE ftxui::component
)
