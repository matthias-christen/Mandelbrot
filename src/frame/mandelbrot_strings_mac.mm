#import <Cocoa/Cocoa.h>
#import "zephyros.h"
#import "zephyros_strings.h"


#define ADD_STRING(id, s) Zephyros::SetString(id, [NSLocalizedString(@s, @"") UTF8String])


void SetStrings()
{
    ADD_STRING(ZS_DEMODLG_WNDTITLE, "");
}
