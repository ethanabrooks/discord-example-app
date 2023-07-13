{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/";
    utils.url = "github:numtide/flake-utils/";
  };

  outputs = {
    self,
    nixpkgs,
    utils,
  }: let
    out = system: let
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
        };
      };
      weave-front-end = pkgs.mkYarnPackage {
        name = "weave-front-end";
        src = ./.;
        packageJSON = ./package.json;
        yarnLock = ./yarn.lock;
        # NOTE: this is optional and generated dynamically if omitted
        yarnNix = ./yarn.nix;
      };
    in {
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          alejandra
          nodejs_20
          ngrok
          yarn
          weave-front-end
          libuuid
        ];
        PYTHONBREAKPOINT = "ipdb.set_trace";
        LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [pkgs.libuuid];
        shellHook = ''
          set -o allexport
          source .env
          set +o allexport
        '';
      };
    };
  in
    utils.lib.eachDefaultSystem out;
}
