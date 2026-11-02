#include <stdio.h>

static int bar_uninitialized;
static double bar_table[128];

void bar(void)
{
    bar_uninitialized = 55;
    bar_table[0] = 3.14159;

    printf("bar(): %d %.5f\n",
           bar_uninitialized,
           bar_table[0]);
}
