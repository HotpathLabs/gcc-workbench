#include <stdio.h>

int global_counter = 100;

static int foo_static_data = 1234;
static char foo_buffer[4096];

const char foo_message[] =
    "This string should appear in .rodata";

void foo(void)
{
    foo_buffer[0] = 1;

    printf("foo(): %d %s\n",
           foo_static_data,
           foo_message);

    global_counter++;
}
