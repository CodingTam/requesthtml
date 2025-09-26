(function ($) {
    "use strict";

    /*==================================================================
    [ Focus input ]*/
    $('.input100').each(function(){
        $(this).on('blur', function(){
            if($(this).val().trim() != "") {
                $(this).addClass('has-val');
            }
            else {
                $(this).removeClass('has-val');
            }
        })
    })

    /*==================================================================
    [ Validate ]*/
    var input = $('.validate-input .input100');

    $('.validate-form').on('submit',function(e){
        e.preventDefault();
        var check = true;

        for(var i=0; i<input.length; i++) {
            if(validate(input[i]) == false){
                showValidate(input[i]);
                check=false;
            }
        }

        if(check) {
            authenticateUser();
        }

        return false;
    });

    $('.validate-form .input100').each(function(){
        $(this).focus(function(){
           hideValidate(this);
        });
    });

    function validate (input) {
        if($(input).attr('type') == 'email' || $(input).attr('name') == 'email') {
            if($(input).val().trim().match(/^([a-zA-Z0-9_\-\.]+)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.)|(([a-zA-Z0-9\-]+\.)+))([a-zA-Z]{1,5}|[0-9]{1,3})(\]?)$/) == null) {
                return false;
            }
        }
        else {
            if($(input).val().trim() == ''){
                return false;
            }
        }
    }

    function showValidate(input) {
        var thisAlert = $(input).parent();

        $(thisAlert).addClass('alert-validate');
    }

    function hideValidate(input) {
        var thisAlert = $(input).parent();

        $(thisAlert).removeClass('alert-validate');
    }

    /*==================================================================
    [ Show pass ]*/
    var showPass = 0;
    $('.btn-show-pass').on('click', function(){
        if(showPass == 0) {
            $(this).next('input').attr('type','text');
            $(this).find('i').removeClass('fa-eye');
            $(this).find('i').addClass('fa-eye-slash');
            showPass = 1;
        }
        else {
            $(this).next('input').attr('type','password');
            $(this).find('i').removeClass('fa-eye-slash');
            $(this).find('i').addClass('fa-eye');
            showPass = 0;
        }

    });

    /*==================================================================
    [ Authentication ]*/
    function authenticateUser() {
        var username = $('input[name="username"]').val().trim();
        var password = $('input[name="pass"]').val().trim();

        // Show loading state
        var $button = $('.login100-form-btn');
        var originalText = $button.text();
        $button.text('Logging in...').prop('disabled', true);

        // Simulate authentication delay
        setTimeout(function() {
            if(username === 'admin' && password === 'admin') {
                // Success
                $button.text('Success!').css('background-color', '#28a745');
                setTimeout(function() {
                    // Store current user
                    localStorage.setItem('currentUser', username);
                    // Redirect to dashboard
                    window.location.href = 'dashboard.html';
                }, 500);
            } else {
                // Failure
                $button.text('Login Failed').css('background-color', '#dc3545');
                showLoginError('Invalid username or password');

                // Reset button after 2 seconds
                setTimeout(function() {
                    $button.text(originalText)
                           .css('background-color', '#57b846')
                           .prop('disabled', false);
                }, 2000);
            }
        }, 1000);
    }

    function showLoginError(message) {
        // Remove existing error message
        $('.login-error-msg').remove();

        // Create and show error message
        var errorHtml = '<div class="login-error-msg" style="color: #dc3545; text-align: center; margin-top: 15px; font-family: Poppins-Regular; font-size: 14px;">' + message + '</div>';
        $('.container-login100-form-btn').after(errorHtml);

        // Remove error message after 3 seconds
        setTimeout(function() {
            $('.login-error-msg').fadeOut(300, function() {
                $(this).remove();
            });
        }, 3000);
    }

})(jQuery);