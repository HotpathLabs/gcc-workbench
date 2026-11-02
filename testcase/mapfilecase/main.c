#include <stdio.h>

extern int global_counter;
extern void foo(void);
extern void bar(void);

static int main_static = 42;

int main(void)
{
    printf("main_static = %d\n", main_static);

    foo();
    bar();

    printf("global_counter = %d\n", global_counter);

    return 0;
}
